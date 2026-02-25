import { stringToAsciiCode } from "./ascii"

type BasicValue = number | string

type ProgramLine = {
  lineNumber: number
  legacyLineNumber: number | null
  source: string
  statements: string[]
}

type ForFrame = {
  varName: string
  end: number
  step: number
  loopStartIp: number
}

type BasicRenderer = {
  clear: (colorIndex?: number) => void
  setColor: (fgColor: number, bgColor?: number) => void
  locate: (col: number, row: number) => void
  write: (text: string) => void
  printLine: (text?: string) => void
  newLine: () => void
  tab: () => void
  pset: (x: number, y: number, color?: number) => void
  line: (x1: number, y1: number, x2: number, y2: number, color?: number) => void
  rect: (x: number, y: number, width: number, height: number, color?: number) => void
}

type BasicHost = {
  renderer: BasicRenderer
  requestInput: (prompt: string) => Promise<string>
  consumeKey: () => string | null
  onLog?: (message: string) => void
}

type BasicRuntimeSnapshot = {
  ip: number
  nextIp: number | null
  halted: boolean
  steps: number
  variables: Record<string, BasicValue>
  arrays: Record<string, BasicValue[]>
}

type Token =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: string }
  | { type: "paren"; value: "(" | ")" }
  | { type: "comma" }
  | { type: "eof" }

const YIELD_INTERVAL = 100
const EXECUTION_GUARD = 200_000

const normalizeName = (name: string): string => name.trim().toUpperCase()

const isStringVariableName = (name: string): boolean => normalizeName(name).endsWith("$")

const isTruthy = (value: BasicValue): boolean => {
  if (typeof value === "string") {
    return value.length > 0
  }
  return value !== 0
}

const splitTopLevel = (text: string, delimiter: string): string[] => {
  const result: string[] = []
  let start = 0
  let depth = 0
  let inString = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === "\"") {
      if (inString && text[i + 1] === "\"") {
        i += 1
        continue
      }
      inString = !inString
      continue
    }

    if (inString) continue
    if (char === "(") {
      depth += 1
      continue
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1)
      continue
    }
    if (depth === 0 && char === delimiter) {
      result.push(text.slice(start, i))
      start = i + 1
    }
  }

  result.push(text.slice(start))
  return result
}

const findTopLevelKeyword = (text: string, keyword: string): number => {
  const upper = text.toUpperCase()
  const target = keyword.toUpperCase()
  let depth = 0
  let inString = false

  for (let i = 0; i <= upper.length - target.length; i += 1) {
    const char = text[i]
    if (char === "\"") {
      if (inString && text[i + 1] === "\"") {
        i += 1
        continue
      }
      inString = !inString
      continue
    }
    if (inString) continue
    if (char === "(") {
      depth += 1
      continue
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1)
      continue
    }
    if (depth !== 0) continue

    if (upper.slice(i, i + target.length) !== target) continue
    const before = upper[i - 1] ?? " "
    const after = upper[i + target.length] ?? " "
    if (/[A-Z0-9_$]/.test(before) || /[A-Z0-9_$]/.test(after)) {
      continue
    }
    return i
  }

  return -1
}

const startsWithKeyword = (statement: string, keyword: string): boolean => {
  const trimmed = statement.trimStart()
  const upper = trimmed.toUpperCase()
  const target = keyword.toUpperCase()
  if (!upper.startsWith(target)) return false
  const boundary = trimmed[target.length]
  return !boundary || /\s/.test(boundary)
}

const takeKeyword = (statement: string, keyword: string): string | null => {
  const trimmed = statement.trimStart()
  if (!startsWithKeyword(trimmed, keyword)) return null
  return trimmed.slice(keyword.length).trimStart()
}

const tokenize = (expression: string): Token[] => {
  const tokens: Token[] = []
  let index = 0

  while (index < expression.length) {
    const char = expression[index]

    if (/\s/.test(char)) {
      index += 1
      continue
    }

    if (char === "\"") {
      let value = ""
      index += 1
      while (index < expression.length) {
        const current = expression[index]
        if (current === "\"") {
          if (expression[index + 1] === "\"") {
            value += "\""
            index += 2
            continue
          }
          index += 1
          break
        }
        value += current
        index += 1
      }
      tokens.push({ type: "string", value })
      continue
    }

    if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(expression[index + 1] ?? ""))) {
      let raw = ""
      while (index < expression.length && /[0-9.]/.test(expression[index])) {
        raw += expression[index]
        index += 1
      }
      tokens.push({ type: "number", value: Number.parseFloat(raw) })
      continue
    }

    if (/[A-Za-z_]/.test(char)) {
      let raw = ""
      while (index < expression.length && /[A-Za-z0-9_$]/.test(expression[index])) {
        raw += expression[index]
        index += 1
      }
      tokens.push({ type: "identifier", value: raw })
      continue
    }

    const twoChar = expression.slice(index, index + 2)
    if (["<=", ">=", "<>"].includes(twoChar)) {
      tokens.push({ type: "operator", value: twoChar })
      index += 2
      continue
    }

    if (["+", "-", "*", "/", "=", "<", ">"].includes(char)) {
      tokens.push({ type: "operator", value: char })
      index += 1
      continue
    }

    if (char === "(" || char === ")") {
      tokens.push({ type: "paren", value: char })
      index += 1
      continue
    }

    if (char === ",") {
      tokens.push({ type: "comma" })
      index += 1
      continue
    }

    throw new Error(`Unexpected token "${char}" in expression: ${expression}`)
  }

  tokens.push({ type: "eof" })
  return tokens
}

class ExpressionParser {
  private index = 0

  constructor(private readonly tokens: Token[], private readonly runtime: BasicRuntime) {}

  parse(): BasicValue {
    const value = this.parseOr()
    this.expect("eof")
    return value
  }

  private parseOr(): BasicValue {
    let left = this.parseAnd()
    while (this.matchKeyword("OR")) {
      const right = this.parseAnd()
      left = isTruthy(left) || isTruthy(right) ? 1 : 0
    }
    return left
  }

  private parseAnd(): BasicValue {
    let left = this.parseCompare()
    while (this.matchKeyword("AND")) {
      const right = this.parseCompare()
      left = isTruthy(left) && isTruthy(right) ? 1 : 0
    }
    return left
  }

  private parseCompare(): BasicValue {
    let left = this.parseAddSub()

    while (true) {
      const token = this.peek()
      if (token.type !== "operator" || !["=", "<>", "<", ">", "<=", ">="].includes(token.value)) {
        break
      }
      this.consume()
      const right = this.parseAddSub()
      const comparison = this.compare(left, right, token.value)
      left = comparison ? 1 : 0
    }

    return left
  }

  private compare(left: BasicValue, right: BasicValue, operator: string): boolean {
    if (typeof left === "string" || typeof right === "string") {
      const lhs = this.runtime.toStringValue(left)
      const rhs = this.runtime.toStringValue(right)
      if (operator === "=") return lhs === rhs
      if (operator === "<>") return lhs !== rhs
      if (operator === "<") return lhs < rhs
      if (operator === ">") return lhs > rhs
      if (operator === "<=") return lhs <= rhs
      if (operator === ">=") return lhs >= rhs
      return false
    }

    const lhs = this.runtime.toNumberValue(left)
    const rhs = this.runtime.toNumberValue(right)
    if (operator === "=") return lhs === rhs
    if (operator === "<>") return lhs !== rhs
    if (operator === "<") return lhs < rhs
    if (operator === ">") return lhs > rhs
    if (operator === "<=") return lhs <= rhs
    if (operator === ">=") return lhs >= rhs
    return false
  }

  private parseAddSub(): BasicValue {
    let left = this.parseMulDiv()

    while (true) {
      const token = this.peek()
      if (token.type !== "operator" || !["+", "-"].includes(token.value)) {
        break
      }
      this.consume()
      const right = this.parseMulDiv()
      if (token.value === "+") {
        if (typeof left === "string" || typeof right === "string") {
          left = this.runtime.toStringValue(left) + this.runtime.toStringValue(right)
        } else {
          left = this.runtime.toNumberValue(left) + this.runtime.toNumberValue(right)
        }
      } else {
        left = this.runtime.toNumberValue(left) - this.runtime.toNumberValue(right)
      }
    }

    return left
  }

  private parseMulDiv(): BasicValue {
    let left = this.parseUnary()

    while (true) {
      const token = this.peek()
      const isModKeyword = token.type === "identifier" && token.value.toUpperCase() === "MOD"
      if (!(token.type === "operator" && ["/", "*"].includes(token.value)) && !isModKeyword) {
        break
      }
      this.consume()
      const right = this.parseUnary()
      if (isModKeyword) {
        left = this.runtime.toNumberValue(left) % this.runtime.toNumberValue(right)
      } else if (token.type === "operator" && token.value === "*") {
        left = this.runtime.toNumberValue(left) * this.runtime.toNumberValue(right)
      } else {
        left = this.runtime.toNumberValue(left) / this.runtime.toNumberValue(right)
      }
    }

    return left
  }

  private parseUnary(): BasicValue {
    const token = this.peek()
    if (token.type === "operator" && token.value === "-") {
      this.consume()
      return -this.runtime.toNumberValue(this.parseUnary())
    }
    if (token.type === "operator" && token.value === "+") {
      this.consume()
      return this.runtime.toNumberValue(this.parseUnary())
    }
    if (token.type === "identifier" && token.value.toUpperCase() === "NOT") {
      this.consume()
      return isTruthy(this.parseUnary()) ? 0 : 1
    }
    return this.parsePrimary()
  }

  private parsePrimary(): BasicValue {
    const token = this.peek()

    if (token.type === "number") {
      this.consume()
      return token.value
    }

    if (token.type === "string") {
      this.consume()
      return token.value
    }

    if (token.type === "identifier") {
      this.consume()
      const name = token.value
      const upperName = normalizeName(name)

      if (this.matchParen("(")) {
        const args: BasicValue[] = []
        if (!this.checkParen(")")) {
          do {
            args.push(this.parseOr())
          } while (this.matchComma())
        }
        this.expectParen(")")
        if (this.runtime.isFunction(upperName)) {
          return this.runtime.callFunction(upperName, args)
        }
        if (args.length !== 1) {
          throw new Error(`Array "${name}" expects a single index`)
        }
        return this.runtime.getArrayValue(upperName, this.runtime.toInteger(args[0]))
      }

      if (this.runtime.isFunction(upperName)) {
        return this.runtime.callFunction(upperName, [])
      }

      return this.runtime.getScalar(upperName)
    }

    if (this.matchParen("(")) {
      const value = this.parseOr()
      this.expectParen(")")
      return value
    }

    throw new Error("Invalid expression")
  }

  private matchKeyword(keyword: string): boolean {
    const token = this.peek()
    if (token.type !== "identifier") return false
    if (token.value.toUpperCase() !== keyword.toUpperCase()) return false
    this.consume()
    return true
  }

  private matchParen(value: "(" | ")"): boolean {
    const token = this.peek()
    if (token.type !== "paren" || token.value !== value) return false
    this.consume()
    return true
  }

  private checkParen(value: "(" | ")"): boolean {
    const token = this.peek()
    return token.type === "paren" && token.value === value
  }

  private expectParen(value: "(" | ")"): void {
    if (!this.matchParen(value)) {
      throw new Error(`Expected "${value}"`)
    }
  }

  private matchComma(): boolean {
    if (this.peek().type !== "comma") return false
    this.consume()
    return true
  }

  private expect(type: Token["type"]): void {
    if (this.peek().type !== type) {
      throw new Error(`Expected token type "${type}"`)
    }
    this.consume()
  }

  private peek(): Token {
    return this.tokens[this.index] ?? { type: "eof" }
  }

  private consume(): Token {
    const token = this.peek()
    this.index += 1
    return token
  }
}

export class BasicRuntime {
  private readonly variables = new Map<string, BasicValue>()
  private readonly arrays = new Map<string, BasicValue[]>()
  private readonly lineNumberIndex = new Map<number, number>()
  private readonly callStack: number[] = []
  private readonly forStack: ForFrame[] = []
  private program: ProgramLine[] = []
  private ip = 0
  private nextIp: number | null = null
  private halted = false
  private steps = 0

  constructor(private readonly host: BasicHost) {}

  stop(): void {
    this.halted = true
  }

  getSnapshot(): BasicRuntimeSnapshot {
    const variables: Record<string, BasicValue> = {}
    for (const [name, value] of this.variables.entries()) {
      variables[name] = value
    }

    const arrays: Record<string, BasicValue[]> = {}
    for (const [name, values] of this.arrays.entries()) {
      arrays[name] = [...values]
    }

    return {
      ip: this.ip,
      nextIp: this.nextIp,
      halted: this.halted,
      steps: this.steps,
      variables,
      arrays,
    }
  }

  async run(source: string): Promise<void> {
    this.reset()
    this.program = this.parseProgram(source)
    this.buildLineNumberIndex(this.program)
    this.ip = 0

    while (!this.halted && this.ip < this.program.length) {
      this.nextIp = null
      const line = this.program[this.ip]

      for (const statement of line.statements) {
        if (this.halted) break
        if (!statement.trim()) continue
        await this.executeStatement(statement.trim())
        if (this.nextIp !== null || this.halted) {
          break
        }
      }

      if (this.halted) break
      if (this.nextIp !== null) {
        this.ip = this.nextIp
      } else {
        this.ip += 1
      }

      this.steps += 1
      if (this.steps > EXECUTION_GUARD) {
        throw new Error("Execution stopped: step guard exceeded")
      }
      if (this.steps % YIELD_INTERVAL === 0) {
        await new Promise<void>((resolve) => {
          globalThis.setTimeout(resolve, 0)
        })
      }
    }
  }

  toNumberValue(value: BasicValue): number {
    if (typeof value === "number") return value
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  toStringValue(value: BasicValue): string {
    if (typeof value === "string") return value
    if (Number.isInteger(value)) return value.toString()
    return value.toString()
  }

  toInteger(value: BasicValue): number {
    return Math.trunc(this.toNumberValue(value))
  }

  getScalar(name: string): BasicValue {
    const key = normalizeName(name)
    const value = this.variables.get(key)
    if (value !== undefined) return value
    return isStringVariableName(key) ? "" : 0
  }

  setScalar(name: string, value: BasicValue): void {
    const key = normalizeName(name)
    const normalized = isStringVariableName(key)
      ? this.toStringValue(value)
      : this.toNumberValue(value)
    this.variables.set(key, normalized)
  }

  getArrayValue(name: string, index: number): BasicValue {
    const key = normalizeName(name)
    const at = Math.max(0, Math.trunc(index))
    const array = this.arrays.get(key)
    if (!array) {
      return isStringVariableName(key) ? "" : 0
    }
    const value = array[at]
    if (value === undefined) {
      return isStringVariableName(key) ? "" : 0
    }
    return value
  }

  setArrayValue(name: string, index: number, value: BasicValue): void {
    const key = normalizeName(name)
    const at = Math.max(0, Math.trunc(index))
    const array = this.arrays.get(key) ?? []
    while (array.length <= at) {
      array.push(isStringVariableName(key) ? "" : 0)
    }
    array[at] = isStringVariableName(key) ? this.toStringValue(value) : this.toNumberValue(value)
    this.arrays.set(key, array)
  }

  isFunction(name: string): boolean {
    const upper = normalizeName(name)
    return ["ABS", "ASC", "CHR$", "INKEY$", "INT", "LEN", "RND", "STR$", "VAL"].includes(upper)
  }

  callFunction(name: string, args: BasicValue[]): BasicValue {
    const upper = normalizeName(name)
    if (upper === "ABS") {
      return Math.abs(this.toNumberValue(args[0] ?? 0))
    }
    if (upper === "INT") {
      return Math.floor(this.toNumberValue(args[0] ?? 0))
    }
    if (upper === "LEN") {
      return this.toStringValue(args[0] ?? "").length
    }
    if (upper === "CHR$") {
      return String.fromCharCode(this.toInteger(args[0] ?? 32))
    }
    if (upper === "ASC") {
      return stringToAsciiCode(this.toStringValue(args[0] ?? ""))
    }
    if (upper === "STR$") {
      return this.toStringValue(args[0] ?? "")
    }
    if (upper === "VAL") {
      return this.toNumberValue(args[0] ?? 0)
    }
    if (upper === "RND") {
      const max = this.toInteger(args[0] ?? 1)
      if (max <= 1) return Math.random()
      return Math.floor(Math.random() * max)
    }
    if (upper === "INKEY$") {
      return this.host.consumeKey() ?? ""
    }
    throw new Error(`Unknown function: ${name}`)
  }

  private reset(): void {
    this.variables.clear()
    this.arrays.clear()
    this.lineNumberIndex.clear()
    this.callStack.length = 0
    this.forStack.length = 0
    this.program = []
    this.ip = 0
    this.nextIp = null
    this.halted = false
    this.steps = 0
    this.host.renderer.clear(0)
    this.host.renderer.setColor(7, 0)
  }

  private parseProgram(source: string): ProgramLine[] {
    const lines = source.replace(/\r\n/g, "\n").split("\n")
    const parsed: ProgramLine[] = []

    for (let index = 0; index < lines.length; index += 1) {
      const rawLine = lines[index] ?? ""
      const trimmed = rawLine.trim()
      const lineNumber = index + 1

      const lineMatch = /^(\d+)\s*(.*)$/.exec(trimmed)
      let legacyLineNumber: number | null = null
      let body = trimmed
      if (lineMatch) {
        legacyLineNumber = Number.parseInt(lineMatch[1], 10)
        body = lineMatch[2].trim()
      }

      const normalizedBody = body === "" ? "REM" : body
      parsed.push({
        lineNumber,
        legacyLineNumber,
        source: normalizedBody,
        statements: splitTopLevel(normalizedBody, ":"),
      })
    }

    return parsed
  }

  private buildLineNumberIndex(program: ProgramLine[]): void {
    program.forEach((line, index) => {
      this.lineNumberIndex.set(line.lineNumber, index)
    })

    program.forEach((line, index) => {
      if (line.legacyLineNumber === null || line.legacyLineNumber === line.lineNumber) {
        return
      }
      const existing = this.lineNumberIndex.get(line.legacyLineNumber)
      if (existing !== undefined && existing !== index) {
        throw new Error(`Duplicate line number ${line.legacyLineNumber}`)
      }
      this.lineNumberIndex.set(line.legacyLineNumber, index)
    })
  }

  private evalExpression(expression: string): BasicValue {
    const parser = new ExpressionParser(tokenize(expression), this)
    return parser.parse()
  }

  private jumpToLineNumber(value: BasicValue): void {
    const lineNumber = this.toInteger(value)
    const index = this.lineNumberIndex.get(lineNumber)
    if (index === undefined) {
      throw new Error(`Unknown line number ${lineNumber}`)
    }
    this.nextIp = index
  }

  private async executeStatement(statement: string): Promise<void> {
    if (!statement) return
    const upper = statement.toUpperCase()

    if (upper.startsWith("REM ") || upper === "REM" || statement.startsWith("'")) {
      return
    }

    const endTail = takeKeyword(statement, "END")
    if (endTail !== null) {
      this.halted = true
      return
    }

    const stopTail = takeKeyword(statement, "STOP")
    if (stopTail !== null) {
      this.halted = true
      return
    }

    const clsTail = takeKeyword(statement, "CLS")
    if (clsTail !== null) {
      if (clsTail.trim()) {
        this.host.renderer.clear(this.toInteger(this.evalExpression(clsTail)))
      } else {
        this.host.renderer.clear(0)
      }
      return
    }

    const colorTail = takeKeyword(statement, "COLOR")
    if (colorTail !== null) {
      const args = splitTopLevel(colorTail, ",").map((part) => part.trim()).filter(Boolean)
      const fg = this.toInteger(this.evalExpression(args[0] ?? "7"))
      const bg = this.toInteger(this.evalExpression(args[1] ?? "0"))
      this.host.renderer.setColor(fg, bg)
      return
    }

    const locateTail = takeKeyword(statement, "LOCATE")
    if (locateTail !== null) {
      const args = splitTopLevel(locateTail, ",").map((part) => part.trim())
      if (args.length < 2) {
        throw new Error(`LOCATE requires 2 arguments: ${statement}`)
      }
      const col = this.toInteger(this.evalExpression(args[0]))
      const row = this.toInteger(this.evalExpression(args[1]))
      this.host.renderer.locate(col, row)
      return
    }

    const printTail = takeKeyword(statement, "PRINT")
    if (printTail !== null) {
      this.handlePrint(printTail)
      return
    }

    const inputTail = takeKeyword(statement, "INPUT")
    if (inputTail !== null) {
      await this.handleInput(inputTail)
      return
    }

    if (startsWithKeyword(statement, "IF")) {
      await this.handleIf(statement)
      return
    }

    const gotoTail = takeKeyword(statement, "GOTO")
    if (gotoTail !== null) {
      this.jumpToLineNumber(this.evalExpression(gotoTail))
      return
    }

    const gosubTail = takeKeyword(statement, "GOSUB")
    if (gosubTail !== null) {
      this.callStack.push(this.ip + 1)
      this.jumpToLineNumber(this.evalExpression(gosubTail))
      return
    }

    const returnTail = takeKeyword(statement, "RETURN")
    if (returnTail !== null) {
      const returnIp = this.callStack.pop()
      if (returnIp === undefined) {
        throw new Error("RETURN called with empty GOSUB stack")
      }
      this.nextIp = returnIp
      return
    }

    if (startsWithKeyword(statement, "FOR")) {
      this.handleFor(statement)
      return
    }

    if (startsWithKeyword(statement, "NEXT")) {
      this.handleNext(statement)
      return
    }

    if (startsWithKeyword(statement, "DIM")) {
      this.handleDim(statement)
      return
    }

    const psetTail = takeKeyword(statement, "PSET")
    if (psetTail !== null) {
      const args = splitTopLevel(psetTail, ",").map((part) => part.trim())
      if (args.length < 2) {
        throw new Error(`PSET requires at least 2 arguments: ${statement}`)
      }
      const x = this.toNumberValue(this.evalExpression(args[0]))
      const y = this.toNumberValue(this.evalExpression(args[1]))
      const color = args[2] ? this.toInteger(this.evalExpression(args[2])) : undefined
      this.host.renderer.pset(x, y, color)
      return
    }

    const lineTail = takeKeyword(statement, "LINE")
    if (lineTail !== null) {
      const args = splitTopLevel(lineTail, ",").map((part) => part.trim())
      if (args.length < 4) {
        throw new Error(`LINE requires at least 4 arguments: ${statement}`)
      }
      const x1 = this.toNumberValue(this.evalExpression(args[0]))
      const y1 = this.toNumberValue(this.evalExpression(args[1]))
      const x2 = this.toNumberValue(this.evalExpression(args[2]))
      const y2 = this.toNumberValue(this.evalExpression(args[3]))
      const color = args[4] ? this.toInteger(this.evalExpression(args[4])) : undefined
      this.host.renderer.line(x1, y1, x2, y2, color)
      return
    }

    const rectTail = takeKeyword(statement, "RECT")
    if (rectTail !== null) {
      const args = splitTopLevel(rectTail, ",").map((part) => part.trim())
      if (args.length < 4) {
        throw new Error(`RECT requires at least 4 arguments: ${statement}`)
      }
      const x = this.toNumberValue(this.evalExpression(args[0]))
      const y = this.toNumberValue(this.evalExpression(args[1]))
      const w = this.toNumberValue(this.evalExpression(args[2]))
      const h = this.toNumberValue(this.evalExpression(args[3]))
      const color = args[4] ? this.toInteger(this.evalExpression(args[4])) : undefined
      this.host.renderer.rect(x, y, w, h, color)
      return
    }

    if (startsWithKeyword(statement, "LET")) {
      const tail = takeKeyword(statement, "LET")
      if (tail !== null) {
        this.handleAssignment(tail)
        return
      }
    }

    if (this.tryHandleAssignment(statement)) {
      return
    }

    throw new Error(`Unknown statement: ${statement}`)
  }

  private handlePrint(tail: string): void {
    const trimmed = tail.trim()
    if (!trimmed) {
      this.host.renderer.newLine()
      return
    }

    const segments = this.parsePrintSegments(tail)
    let lastSeparator: ";" | "," | null = null

    for (const segment of segments) {
      if (segment.expression.trim()) {
        const value = this.evalExpression(segment.expression)
        this.host.renderer.write(this.toStringValue(value))
      }

      if (segment.separator === ",") {
        this.host.renderer.tab()
      }

      lastSeparator = segment.separator
    }

    if (lastSeparator !== ";") {
      this.host.renderer.newLine()
    }
  }

  private parsePrintSegments(tail: string): { expression: string; separator: ";" | "," | null }[] {
    const segments: { expression: string; separator: ";" | "," | null }[] = []
    let depth = 0
    let inString = false
    let start = 0

    for (let i = 0; i < tail.length; i += 1) {
      const char = tail[i]

      if (char === "\"") {
        if (inString && tail[i + 1] === "\"") {
          i += 1
          continue
        }
        inString = !inString
        continue
      }

      if (inString) continue
      if (char === "(") {
        depth += 1
        continue
      }
      if (char === ")") {
        depth = Math.max(0, depth - 1)
        continue
      }

      if (depth === 0 && (char === ";" || char === ",")) {
        segments.push({
          expression: tail.slice(start, i),
          separator: char as ";" | ",",
        })
        start = i + 1
      }
    }

    const trailingExpression = tail.slice(start)
    if (trailingExpression.length > 0 || segments.length === 0) {
      segments.push({
        expression: trailingExpression,
        separator: null,
      })
    }

    return segments
  }

  private async handleInput(tail: string): Promise<void> {
    let prompt = "? "
    let target = tail.trim()

    if (target.startsWith("\"")) {
      const end = this.findStringEnd(target, 0)
      if (end > 0) {
        prompt = target
          .slice(1, end - 1)
          .replace(/""/g, "\"")
          .concat(" ")
        target = target.slice(end).trim()
        if (target.startsWith(";") || target.startsWith(",")) {
          target = target.slice(1).trim()
        }
      }
    }

    if (!target) {
      throw new Error(`INPUT missing variable target: ${tail}`)
    }

    this.host.renderer.write(prompt)
    const value = await this.host.requestInput(prompt)
    this.host.renderer.printLine(value)
    this.assignTarget(target, value)
  }

  private async handleIf(statement: string): Promise<void> {
    const ifTail = statement.trim().slice(2).trim()
    const thenIndex = findTopLevelKeyword(ifTail, "THEN")
    if (thenIndex < 0) {
      throw new Error(`IF missing THEN: ${statement}`)
    }

    const conditionExpr = ifTail.slice(0, thenIndex).trim()
    const thenElsePart = ifTail.slice(thenIndex + 4).trim()
    const elseIndex = findTopLevelKeyword(thenElsePart, "ELSE")
    const thenPart =
      elseIndex >= 0 ? thenElsePart.slice(0, elseIndex).trim() : thenElsePart
    const elsePart = elseIndex >= 0 ? thenElsePart.slice(elseIndex + 4).trim() : ""

    const condition = this.evalExpression(conditionExpr)
    const selected = isTruthy(condition) ? thenPart : elsePart
    if (!selected) return

    if (/^\d+$/.test(selected)) {
      this.jumpToLineNumber(Number.parseInt(selected, 10))
      return
    }

    await this.executeStatement(selected)
  }

  private handleFor(statement: string): void {
    const tail = statement.trim().slice(3).trim()
    const eqIndex = this.findTopLevelAssignmentIndex(tail)
    if (eqIndex < 0) {
      throw new Error(`FOR missing "=": ${statement}`)
    }

    const varName = tail.slice(0, eqIndex).trim()
    const rhs = tail.slice(eqIndex + 1).trim()
    const toIndex = findTopLevelKeyword(rhs, "TO")
    if (toIndex < 0) {
      throw new Error(`FOR missing TO: ${statement}`)
    }

    const startExpr = rhs.slice(0, toIndex).trim()
    const endStep = rhs.slice(toIndex + 2).trim()
    const stepIndex = findTopLevelKeyword(endStep, "STEP")
    const endExpr = stepIndex >= 0 ? endStep.slice(0, stepIndex).trim() : endStep
    const stepExpr = stepIndex >= 0 ? endStep.slice(stepIndex + 4).trim() : "1"

    const start = this.toNumberValue(this.evalExpression(startExpr))
    const end = this.toNumberValue(this.evalExpression(endExpr))
    const step = this.toNumberValue(this.evalExpression(stepExpr))

    if (step === 0) {
      throw new Error("FOR STEP cannot be 0")
    }

    this.setScalar(varName, start)
    this.forStack.push({
      varName: normalizeName(varName),
      end,
      step,
      loopStartIp: this.ip + 1,
    })
  }

  private handleNext(statement: string): void {
    const tail = statement.trim().slice(4).trim()
    const nextVar = tail ? normalizeName(tail) : null

    let frameIndex = -1
    for (let i = this.forStack.length - 1; i >= 0; i -= 1) {
      if (!nextVar || this.forStack[i].varName === nextVar) {
        frameIndex = i
        break
      }
    }

    if (frameIndex < 0) {
      throw new Error("NEXT without matching FOR")
    }

    const frame = this.forStack[frameIndex]
    const current = this.toNumberValue(this.getScalar(frame.varName))
    const updated = current + frame.step
    this.setScalar(frame.varName, updated)

    const shouldContinue = frame.step > 0 ? updated <= frame.end : updated >= frame.end
    if (shouldContinue) {
      this.nextIp = frame.loopStartIp
      return
    }

    this.forStack.splice(frameIndex, 1)
  }

  private handleDim(statement: string): void {
    const tail = statement.trim().slice(3).trim()
    const declarations = splitTopLevel(tail, ",").map((item) => item.trim()).filter(Boolean)
    for (const declaration of declarations) {
      const open = declaration.indexOf("(")
      const close = declaration.lastIndexOf(")")
      if (open < 1 || close <= open) {
        throw new Error(`Invalid DIM declaration: ${declaration}`)
      }
      const name = normalizeName(declaration.slice(0, open).trim())
      const sizeExpr = declaration.slice(open + 1, close).trim()
      const size = Math.max(0, this.toInteger(this.evalExpression(sizeExpr)))
      const fillValue = isStringVariableName(name) ? "" : 0
      const values = Array.from({ length: size + 1 }, () => fillValue)
      this.arrays.set(name, values)
    }
  }

  private tryHandleAssignment(statement: string): boolean {
    const assignmentIndex = this.findTopLevelAssignmentIndex(statement)
    if (assignmentIndex < 0) return false

    const left = statement.slice(0, assignmentIndex).trim()
    const right = statement.slice(assignmentIndex + 1).trim()
    if (!left || !right) return false

    this.assignTarget(left, this.evalExpression(right))
    return true
  }

  private handleAssignment(assignment: string): void {
    const assignmentIndex = this.findTopLevelAssignmentIndex(assignment)
    if (assignmentIndex < 0) {
      throw new Error(`Invalid assignment: ${assignment}`)
    }

    const left = assignment.slice(0, assignmentIndex).trim()
    const right = assignment.slice(assignmentIndex + 1).trim()
    this.assignTarget(left, this.evalExpression(right))
  }

  private assignTarget(target: string, value: BasicValue): void {
    const trimmed = target.trim()
    const open = trimmed.indexOf("(")
    const close = trimmed.lastIndexOf(")")

    if (open > 0 && close > open) {
      const name = trimmed.slice(0, open).trim()
      const indexExpr = trimmed.slice(open + 1, close).trim()
      const index = this.toInteger(this.evalExpression(indexExpr))
      this.setArrayValue(name, index, value)
      return
    }

    if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(trimmed)) {
      throw new Error(`Invalid assignment target: ${target}`)
    }
    this.setScalar(trimmed, value)
  }

  private findTopLevelAssignmentIndex(text: string): number {
    let depth = 0
    let inString = false

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i]
      if (char === "\"") {
        if (inString && text[i + 1] === "\"") {
          i += 1
          continue
        }
        inString = !inString
        continue
      }
      if (inString) continue
      if (char === "(") {
        depth += 1
        continue
      }
      if (char === ")") {
        depth = Math.max(0, depth - 1)
        continue
      }
      if (depth !== 0 || char !== "=") continue

      const prev = text[i - 1] ?? ""
      const next = text[i + 1] ?? ""
      if (prev === "<" || prev === ">" || next === "=") {
        continue
      }
      return i
    }

    return -1
  }

  private findStringEnd(text: string, startIndex: number): number {
    let i = startIndex
    if (text[i] !== "\"") return -1
    i += 1
    while (i < text.length) {
      if (text[i] === "\"") {
        if (text[i + 1] === "\"") {
          i += 2
          continue
        }
        return i + 1
      }
      i += 1
    }
    return -1
  }
}

export type { BasicHost, BasicRenderer, BasicValue, BasicRuntimeSnapshot }

export type BasicVisualStatementKind =
  | "rem"
  | "apostrophe"
  | "end"
  | "stop"
  | "cls"
  | "color"
  | "locate"
  | "print"
  | "input"
  | "if"
  | "goto"
  | "gosub"
  | "return"
  | "for"
  | "next"
  | "dim"
  | "pset"
  | "line"
  | "rect"
  | "let"
  | "assign"
  | "raw"

export type BasicVisualStatement = {
  kind: BasicVisualStatementKind
  fields: Record<string, string>
}

export type BasicVisualLine = {
  legacyLineNumber: string
  statement: BasicVisualStatement
}

const makeStatement = (
  kind: BasicVisualStatementKind,
  fields: Record<string, string> = {}
): BasicVisualStatement => ({
  kind,
  fields,
})

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

const splitTopLevel = (text: string, delimiter: string): string[] => {
  const result: string[] = []
  let start = 0
  let depth = 0
  let inString = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"') {
      if (inString && text[i + 1] === '"') {
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
    if (char === '"') {
      if (inString && text[i + 1] === '"') {
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

const findTopLevelAssignmentIndex = (text: string): number => {
  let depth = 0
  let inString = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"') {
      if (inString && text[i + 1] === '"') {
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

const parseAssignmentFields = (
  assignment: string
): Record<string, string> | null => {
  const assignmentIndex = findTopLevelAssignmentIndex(assignment)
  if (assignmentIndex < 0) return null

  const target = assignment.slice(0, assignmentIndex).trim()
  const value = assignment.slice(assignmentIndex + 1).trim()
  if (!target || !value) return null

  return { target, value }
}

const parseArgList = (tail: string): string[] =>
  splitTopLevel(tail, ",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

const trimTrailingEmpty = (parts: string[]): string[] => {
  const trimmed = [...parts]
  while (trimmed.length > 0 && trimmed[trimmed.length - 1].trim().length === 0) {
    trimmed.pop()
  }
  return trimmed
}

const emitArgs = (...parts: string[]): string => trimTrailingEmpty(parts).join(",")

const normalizeJumpTarget = (value: string): string =>
  value.trim().replace(/^#\s*/, "")

const toBasicStringLiteral = (value: string): string =>
  `"${value.replace(/"/g, "\"\"")}"`

const parseBasicStringLiteral = (value: string): string | null => {
  const trimmed = value.trim()
  if (trimmed.length < 2) return null
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) return null

  let unescaped = ""

  for (let index = 1; index < trimmed.length - 1; index += 1) {
    const char = trimmed[index]
    if (char === '"') {
      if (trimmed[index + 1] === '"') {
        unescaped += '"'
        index += 1
        continue
      }
      return null
    }
    unescaped += char
  }

  return unescaped
}

const parsePrintSegments = (tail: string) => {
  const segments: { expression: string; separator: ";" | "," | null }[] = []
  let depth = 0
  let inString = false
  let start = 0

  for (let index = 0; index < tail.length; index += 1) {
    const char = tail[index]

    if (char === '"') {
      if (inString && tail[index + 1] === '"') {
        index += 1
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
        expression: tail.slice(start, index),
        separator: char,
      })
      start = index + 1
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

const looksLikeBasicExpression = (value: string): boolean => {
  const trimmed = value.trim()
  if (!trimmed) return false

  if (trimmed.includes('"')) return true
  if (/[$()#+\-*/^<>=]/.test(trimmed)) return true
  if (/^\d+(\.\d+)?$/.test(trimmed)) return true
  if (/^[A-Z][A-Z0-9_]*\$$/i.test(trimmed)) return true
  if (/^[A-Z][A-Z0-9_]*$/i.test(trimmed) && trimmed.length <= 2) return true

  return false
}

const parsePrintValueForVisual = (value: string): string => {
  return parsePrintSegments(value)
    .map(({ expression, separator }) => {
      const parsed = parseBasicStringLiteral(expression)
      return `${parsed ?? expression}${separator ?? ""}`
    })
    .join("")
}

const emitPrintValueForSource = (value: string): string => {
  if (!value.trim()) return ""

  return parsePrintSegments(value)
    .map(({ expression, separator }) => {
      const trimmedExpression = expression.trim()
      if (!trimmedExpression) {
        return separator ?? ""
      }

      let emittedExpression = trimmedExpression
      if (
        parseBasicStringLiteral(trimmedExpression) === null &&
        !looksLikeBasicExpression(trimmedExpression)
      ) {
        emittedExpression = toBasicStringLiteral(trimmedExpression)
      }

      return `${emittedExpression}${separator ?? ""}`
    })
    .join("")
}

export const parseBasicStatementToVisual = (
  statement: string
): BasicVisualStatement => {
  const trimmed = statement.trim()
  if (!trimmed) {
    return makeStatement("raw", { code: "" })
  }

  const upper = trimmed.toUpperCase()

  if (upper.startsWith("REM ") || upper === "REM") {
    return makeStatement("rem", { text: trimmed.slice(3).trimStart() })
  }

  if (trimmed.startsWith("'")) {
    return makeStatement("apostrophe", { text: trimmed.slice(1).trimStart() })
  }

  if (takeKeyword(trimmed, "END") !== null) {
    return makeStatement("end")
  }

  if (takeKeyword(trimmed, "STOP") !== null) {
    return makeStatement("stop")
  }

  const clsTail = takeKeyword(trimmed, "CLS")
  if (clsTail !== null) {
    return makeStatement("cls", { expr: clsTail.trim() })
  }

  const colorTail = takeKeyword(trimmed, "COLOR")
  if (colorTail !== null) {
    const args = parseArgList(colorTail)
    return makeStatement("color", {
      fg: args[0] ?? "",
      bg: args[1] ?? "",
    })
  }

  const locateTail = takeKeyword(trimmed, "LOCATE")
  if (locateTail !== null) {
    const args = parseArgList(locateTail)
    if (args.length < 2) {
      return makeStatement("raw", { code: trimmed })
    }
    return makeStatement("locate", {
      col: args[0] ?? "",
      row: args[1] ?? "",
    })
  }

  const printTail = takeKeyword(trimmed, "PRINT")
  if (printTail !== null) {
    return makeStatement("print", { value: parsePrintValueForVisual(printTail) })
  }

  const inputTail = takeKeyword(trimmed, "INPUT")
  if (inputTail !== null) {
    return makeStatement("input", { value: inputTail })
  }

  if (startsWithKeyword(trimmed, "IF")) {
    const ifTail = trimmed.slice(2).trim()
    const thenIndex = findTopLevelKeyword(ifTail, "THEN")
    if (thenIndex < 0) {
      return makeStatement("raw", { code: trimmed })
    }

    const condition = ifTail.slice(0, thenIndex).trim()
    const thenElsePart = ifTail.slice(thenIndex + 4).trim()
    const elseIndex = findTopLevelKeyword(thenElsePart, "ELSE")
    const thenPart =
      elseIndex >= 0 ? thenElsePart.slice(0, elseIndex).trim() : thenElsePart
    const elsePart =
      elseIndex >= 0 ? thenElsePart.slice(elseIndex + 4).trim() : ""

    return makeStatement("if", {
      condition,
      then: thenPart,
      else: elsePart,
    })
  }

  const gotoTail = takeKeyword(trimmed, "GOTO")
  if (gotoTail !== null) {
    return makeStatement("goto", { line: normalizeJumpTarget(gotoTail) })
  }

  const gosubTail = takeKeyword(trimmed, "GOSUB")
  if (gosubTail !== null) {
    return makeStatement("gosub", { line: normalizeJumpTarget(gosubTail) })
  }

  if (takeKeyword(trimmed, "RETURN") !== null) {
    return makeStatement("return")
  }

  if (startsWithKeyword(trimmed, "FOR")) {
    const tail = trimmed.slice(3).trim()
    const assignmentIndex = findTopLevelAssignmentIndex(tail)
    if (assignmentIndex < 0) {
      return makeStatement("raw", { code: trimmed })
    }

    const variable = tail.slice(0, assignmentIndex).trim()
    const rhs = tail.slice(assignmentIndex + 1).trim()
    const toIndex = findTopLevelKeyword(rhs, "TO")
    if (toIndex < 0) {
      return makeStatement("raw", { code: trimmed })
    }

    const start = rhs.slice(0, toIndex).trim()
    const endStep = rhs.slice(toIndex + 2).trim()
    const stepIndex = findTopLevelKeyword(endStep, "STEP")
    const end = stepIndex >= 0 ? endStep.slice(0, stepIndex).trim() : endStep
    const step = stepIndex >= 0 ? endStep.slice(stepIndex + 4).trim() : ""

    return makeStatement("for", {
      variable,
      start,
      end,
      step,
    })
  }

  if (startsWithKeyword(trimmed, "NEXT")) {
    return makeStatement("next", { variable: trimmed.slice(4).trim() })
  }

  if (startsWithKeyword(trimmed, "DIM")) {
    return makeStatement("dim", { declarations: trimmed.slice(3).trim() })
  }

  const psetTail = takeKeyword(trimmed, "PSET")
  if (psetTail !== null) {
    const args = parseArgList(psetTail)
    if (args.length < 2) {
      return makeStatement("raw", { code: trimmed })
    }
    return makeStatement("pset", {
      x: args[0] ?? "",
      y: args[1] ?? "",
      color: args[2] ?? "",
    })
  }

  const lineTail = takeKeyword(trimmed, "LINE")
  if (lineTail !== null) {
    const args = parseArgList(lineTail)
    if (args.length < 4) {
      return makeStatement("raw", { code: trimmed })
    }

    return makeStatement("line", {
      x1: args[0] ?? "",
      y1: args[1] ?? "",
      x2: args[2] ?? "",
      y2: args[3] ?? "",
      color: args[4] ?? "",
    })
  }

  const rectTail = takeKeyword(trimmed, "RECT")
  if (rectTail !== null) {
    const args = parseArgList(rectTail)
    if (args.length < 4) {
      return makeStatement("raw", { code: trimmed })
    }

    return makeStatement("rect", {
      x: args[0] ?? "",
      y: args[1] ?? "",
      width: args[2] ?? "",
      height: args[3] ?? "",
      color: args[4] ?? "",
    })
  }

  if (startsWithKeyword(trimmed, "LET")) {
    const assignment = parseAssignmentFields(trimmed.slice(3).trim())
    if (assignment) {
      return makeStatement("let", assignment)
    }
  }

  const assignment = parseAssignmentFields(trimmed)
  if (assignment) {
    return makeStatement("assign", assignment)
  }

  return makeStatement("raw", { code: trimmed })
}

export const emitBasicStatementFromVisual = (
  statement: BasicVisualStatement
): string => {
  const field = (name: string, fallback = "") =>
    (statement.fields[name] ?? fallback).trim()

  if (statement.kind === "rem") {
    const text = field("text")
    return text ? `REM ${text}` : "REM"
  }

  if (statement.kind === "apostrophe") {
    const text = field("text")
    return text ? `' ${text}` : "'"
  }

  if (statement.kind === "end") {
    return "END"
  }

  if (statement.kind === "stop") {
    return "STOP"
  }

  if (statement.kind === "cls") {
    const expr = field("expr")
    return expr ? `CLS ${expr}` : "CLS"
  }

  if (statement.kind === "color") {
    const fg = field("fg", "7")
    const bg = field("bg")
    return emitArgs(fg, bg) ? `COLOR ${emitArgs(fg, bg)}` : "COLOR 7"
  }

  if (statement.kind === "locate") {
    const col = field("col", "0")
    const row = field("row", "0")
    return `LOCATE ${emitArgs(col, row)}`
  }

  if (statement.kind === "print") {
    const value = emitPrintValueForSource(statement.fields.value ?? "")
    return value.trim().length > 0 ? `PRINT ${value}` : "PRINT"
  }

  if (statement.kind === "input") {
    const value = statement.fields.value ?? ""
    return value.trim().length > 0 ? `INPUT ${value}` : "INPUT A$"
  }

  if (statement.kind === "if") {
    const condition = field("condition", "1")
    const thenPart = field("then", "REM")
    const elsePart = field("else")
    return elsePart
      ? `IF ${condition} THEN ${thenPart} ELSE ${elsePart}`
      : `IF ${condition} THEN ${thenPart}`
  }

  if (statement.kind === "goto") {
    const target = normalizeJumpTarget(statement.fields.line ?? "") || "1"
    return `GOTO #${target}`
  }

  if (statement.kind === "gosub") {
    const target = normalizeJumpTarget(statement.fields.line ?? "") || "1"
    return `GOSUB #${target}`
  }

  if (statement.kind === "return") {
    return "RETURN"
  }

  if (statement.kind === "for") {
    const variable = field("variable", "I")
    const start = field("start", "0")
    const end = field("end", "10")
    const step = field("step")
    return step
      ? `FOR ${variable}=${start} TO ${end} STEP ${step}`
      : `FOR ${variable}=${start} TO ${end}`
  }

  if (statement.kind === "next") {
    const variable = field("variable")
    return variable ? `NEXT ${variable}` : "NEXT"
  }

  if (statement.kind === "dim") {
    return `DIM ${field("declarations", "A(8)")}`
  }

  if (statement.kind === "pset") {
    const x = field("x", "0")
    const y = field("y", "0")
    const color = field("color")
    return `PSET ${emitArgs(x, y, color)}`
  }

  if (statement.kind === "line") {
    const x1 = field("x1", "0")
    const y1 = field("y1", "0")
    const x2 = field("x2", "10")
    const y2 = field("y2", "10")
    const color = field("color")
    return `LINE ${emitArgs(x1, y1, x2, y2, color)}`
  }

  if (statement.kind === "rect") {
    const x = field("x", "0")
    const y = field("y", "0")
    const width = field("width", "10")
    const height = field("height", "10")
    const color = field("color")
    return `RECT ${emitArgs(x, y, width, height, color)}`
  }

  if (statement.kind === "let") {
    const target = field("target", "A")
    const value = field("value", "0")
    return `LET ${target}=${value}`
  }

  if (statement.kind === "assign") {
    const target = field("target", "A")
    const value = field("value", "0")
    return `${target}=${value}`
  }

  return statement.fields.code ?? ""
}

export const parseBasicSourceToVisualLines = (source: string): BasicVisualLine[] => {
  if (!source.trim()) {
    return []
  }

  const lines: BasicVisualLine[] = []

  for (const rawLine of source.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = rawLine.trim()
    const lineMatch = /^(\d+)\s*(.*)$/.exec(trimmed)

    const legacyLineNumber = lineMatch?.[1] ?? ""
    const body = (lineMatch?.[2] ?? trimmed).trim()

    if (!body) {
      continue
    }

    const statements = splitTopLevel(body, ":")
      .map((part) => part.trim())
      .filter((part) => part.length > 0)

    if (statements.length === 0) {
      continue
    }

    statements.forEach((statement, index) => {
      lines.push({
        legacyLineNumber: index === 0 ? legacyLineNumber : "",
        statement: parseBasicStatementToVisual(statement),
      })
    })
  }

  return lines
}

export const emitBasicSourceFromVisualLines = (
  lines: BasicVisualLine[]
): string => {
  return lines
    .map((line) => {
      const body = emitBasicStatementFromVisual(line.statement).trim()
      const legacyLineNumber = line.legacyLineNumber.trim()

      if (legacyLineNumber) {
        return body ? `${legacyLineNumber} ${body}` : legacyLineNumber
      }

      return body
    })
    .filter((line) => line.length > 0)
    .join("\n")
}

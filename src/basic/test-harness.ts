import {
  BasicRuntime,
  type BasicRuntimeSnapshot,
  type BasicValue,
} from "./interpreter"

const COLOR_COUNT = 16

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

const normalizeColorIndex = (value: number): number => {
  const normalized = Math.trunc(value) % COLOR_COUNT
  return normalized < 0 ? normalized + COLOR_COUNT : normalized
}

const normalizeVariableName = (name: string): string => name.trim().toUpperCase()

export type BasicHarnessScenario = {
  source: string
  inputs?: string[]
  keys?: string[]
  failOnMissingInput?: boolean
  onLog?: (message: string) => void
}

export type BasicRowExpectation = {
  row: number
  equals?: string
  equalsTrimmed?: string
  startsWith?: string
  contains?: string
}

export type BasicCellExpectation = {
  col: number
  row: number
  equals: string
}

export type BasicPixelExpectation = {
  x: number
  y: number
  equals: number
}

export type BasicExpectation = {
  error?: null | string | RegExp
  rows?: BasicRowExpectation[]
  cells?: BasicCellExpectation[]
  textIncludes?: string[]
  variables?: Record<string, BasicValue>
  pixels?: BasicPixelExpectation[]
}

export type BasicAssertionFailure = {
  path: string
  expected: unknown
  actual: unknown
  message: string
}

export class HeadlessBasicRenderer {
  readonly width = 256
  readonly height = 240
  readonly charWidth = 8
  readonly charHeight = 8
  readonly cols = this.width / this.charWidth
  readonly rows = this.height / this.charHeight

  private cursorX = 0
  private cursorY = 0
  private pendingWrap = false
  private fgColor = 7
  private bgColor = 0
  private readonly chars: string[][]
  private readonly pixels: Uint8Array

  constructor() {
    this.chars = Array.from({ length: this.rows }, () =>
      Array.from({ length: this.cols }, () => " ")
    )
    this.pixels = new Uint8Array(this.width * this.height)
    this.clear(0)
  }

  clear(colorIndex = 0): void {
    this.bgColor = normalizeColorIndex(colorIndex)
    this.cursorX = 0
    this.cursorY = 0
    this.pendingWrap = false

    for (let row = 0; row < this.rows; row += 1) {
      this.chars[row].fill(" ")
    }

    this.pixels.fill(this.bgColor)
  }

  setColor(fgColor: number, bgColor: number = this.bgColor): void {
    this.fgColor = normalizeColorIndex(fgColor)
    this.bgColor = normalizeColorIndex(bgColor)
  }

  locate(col: number, row: number): void {
    this.cursorX = clamp(Math.trunc(col), 0, this.cols - 1)
    this.cursorY = clamp(Math.trunc(row), 0, this.rows - 1)
    this.pendingWrap = false
  }

  write(text: string): void {
    for (const char of text) {
      if (char === "\n") {
        this.newLine()
        continue
      }

      this.putChar(char)
    }
  }

  printLine(text = ""): void {
    this.write(text)
    this.newLine()
  }

  newLine(): void {
    this.pendingWrap = false
    this.cursorX = 0
    this.cursorY += 1
    if (this.cursorY >= this.rows) {
      this.scrollUp()
      this.cursorY = this.rows - 1
    }
  }

  tab(): void {
    const tabSize = 4
    const nextStop = Math.min(
      this.cols - 1,
      Math.ceil((this.cursorX + 1) / tabSize) * tabSize
    )
    while (this.cursorX < nextStop) {
      this.putChar(" ")
    }
  }

  pset(x: number, y: number, color: number = this.fgColor): void {
    const px = clamp(Math.trunc(x), 0, this.width - 1)
    const py = clamp(Math.trunc(y), 0, this.height - 1)
    this.setPixel(px, py, color)
  }

  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: number = this.fgColor
  ): void {
    let startX = Math.trunc(x1)
    let startY = Math.trunc(y1)
    const endX = Math.trunc(x2)
    const endY = Math.trunc(y2)
    const dx = Math.abs(endX - startX)
    const sx = startX < endX ? 1 : -1
    const dy = -Math.abs(endY - startY)
    const sy = startY < endY ? 1 : -1
    let err = dx + dy

    while (true) {
      this.pset(startX, startY, color)
      if (startX === endX && startY === endY) {
        break
      }
      const e2 = err * 2
      if (e2 >= dy) {
        err += dy
        startX += sx
      }
      if (e2 <= dx) {
        err += dx
        startY += sy
      }
    }
  }

  rect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: number = this.fgColor
  ): void {
    const rx = Math.trunc(x)
    const ry = Math.trunc(y)
    const rw = Math.max(0, Math.trunc(width))
    const rh = Math.max(0, Math.trunc(height))

    this.line(rx, ry, rx + rw, ry, color)
    this.line(rx, ry, rx, ry + rh, color)
    this.line(rx + rw, ry, rx + rw, ry + rh, color)
    this.line(rx, ry + rh, rx + rw, ry + rh, color)
  }

  getCursor(): { col: number; row: number } {
    return {
      col: this.cursorX,
      row: this.cursorY,
    }
  }

  getColorState(): { fg: number; bg: number } {
    return {
      fg: this.fgColor,
      bg: this.bgColor,
    }
  }

  getRows(trimmed = false): string[] {
    const rows = this.chars.map((cells) => cells.join(""))
    return trimmed ? rows.map((row) => row.replace(/\s+$/g, "")) : rows
  }

  getText(trimmed = false): string {
    return this.getRows(trimmed).join("\n")
  }

  getCell(col: number, row: number): string {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      return ""
    }
    return this.chars[row][col]
  }

  getPixel(x: number, y: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return this.bgColor
    }

    const normalizedX = Math.trunc(x)
    const normalizedY = Math.trunc(y)
    return this.pixels[normalizedY * this.width + normalizedX]
  }

  getPixelHistogram(): Record<number, number> {
    const histogram: Record<number, number> = {}

    for (let index = 0; index < this.pixels.length; index += 1) {
      const color = this.pixels[index]
      histogram[color] = (histogram[color] ?? 0) + 1
    }

    return histogram
  }

  private drawChar(char: string): void {
    this.chars[this.cursorY][this.cursorX] = char

    // Keep background/pixel state deterministic in headless tests.
    const left = this.cursorX * this.charWidth
    const top = this.cursorY * this.charHeight
    const color = normalizeColorIndex(this.bgColor)

    for (let y = top; y < top + this.charHeight; y += 1) {
      const rowOffset = y * this.width
      for (let x = left; x < left + this.charWidth; x += 1) {
        this.pixels[rowOffset + x] = color
      }
    }
  }

  private putChar(char: string): void {
    if (this.pendingWrap) {
      this.newLine()
    }

    this.drawChar(char)

    if (this.cursorX >= this.cols - 1) {
      this.pendingWrap = true
      return
    }

    this.cursorX += 1
  }

  private setPixel(x: number, y: number, color: number): void {
    this.pixels[y * this.width + x] = normalizeColorIndex(color)
  }

  private scrollUp(): void {
    for (let row = 0; row < this.rows - 1; row += 1) {
      this.chars[row] = [...this.chars[row + 1]]
    }
    this.chars[this.rows - 1].fill(" ")

    const rowPixelCount = this.width * this.charHeight
    this.pixels.copyWithin(0, rowPixelCount)
    this.pixels.fill(this.bgColor, this.pixels.length - rowPixelCount)
  }
}

export type BasicHarnessResult = {
  error: string | null
  renderer: HeadlessBasicRenderer
  state: BasicRuntimeSnapshot
  logs: string[]
  consumedInputs: string[]
  remainingInputs: string[]
  consumedKeys: string[]
  remainingKeys: string[]
}

export const runBasicScenario = async (
  scenario: BasicHarnessScenario
): Promise<BasicHarnessResult> => {
  const renderer = new HeadlessBasicRenderer()
  const inputs = [...(scenario.inputs ?? [])]
  const keys = [...(scenario.keys ?? [])]
  const consumedInputs: string[] = []
  const consumedKeys: string[] = []
  const logs: string[] = []

  const runtime = new BasicRuntime({
    renderer,
    requestInput: async () => {
      if (inputs.length === 0) {
        if (scenario.failOnMissingInput ?? true) {
          throw new Error("INPUT requested but no test input values remain")
        }
        return ""
      }

      const value = inputs.shift() ?? ""
      consumedInputs.push(value)
      return value
    },
    consumeKey: () => {
      if (keys.length === 0) {
        return null
      }

      const value = keys.shift() ?? null
      if (value !== null) {
        consumedKeys.push(value)
      }
      return value
    },
    onLog: (message) => {
      logs.push(message)
      scenario.onLog?.(message)
    },
  })

  let error: string | null = null

  try {
    await runtime.run(scenario.source)
  } catch (runtimeError) {
    error = runtimeError instanceof Error ? runtimeError.message : String(runtimeError)
  }

  return {
    error,
    renderer,
    state: runtime.getSnapshot(),
    logs,
    consumedInputs,
    remainingInputs: inputs,
    consumedKeys,
    remainingKeys: keys,
  }
}

export const assertBasicExpectation = (
  result: BasicHarnessResult,
  expectation: BasicExpectation
): BasicAssertionFailure[] => {
  const failures: BasicAssertionFailure[] = []

  if (expectation.error !== undefined) {
    const expectedError = expectation.error

    if (expectedError === null) {
      if (result.error !== null) {
        failures.push({
          path: "error",
          expected: null,
          actual: result.error,
          message: "Expected no runtime error",
        })
      }
    } else if (typeof expectedError === "string") {
      if (result.error !== expectedError) {
        failures.push({
          path: "error",
          expected: expectedError,
          actual: result.error,
          message: "Runtime error did not match expected value",
        })
      }
    } else if (expectedError instanceof RegExp) {
      if (result.error === null || !expectedError.test(result.error)) {
        failures.push({
          path: "error",
          expected: expectedError,
          actual: result.error,
          message: "Runtime error did not match expected pattern",
        })
      }
    }
  }

  if (expectation.rows) {
    const rows = result.renderer.getRows(false)
    const trimmedRows = result.renderer.getRows(true)

    for (const rowExpectation of expectation.rows) {
      const { row } = rowExpectation
      const actualRow = rows[row] ?? ""
      const actualTrimmed = trimmedRows[row] ?? ""

      if (rowExpectation.equals !== undefined && actualRow !== rowExpectation.equals) {
        failures.push({
          path: `rows[${row}]`,
          expected: rowExpectation.equals,
          actual: actualRow,
          message: "Row did not match expected value",
        })
      }

      if (
        rowExpectation.equalsTrimmed !== undefined &&
        actualTrimmed !== rowExpectation.equalsTrimmed
      ) {
        failures.push({
          path: `rows[${row}] (trimmed)`,
          expected: rowExpectation.equalsTrimmed,
          actual: actualTrimmed,
          message: "Trimmed row did not match expected value",
        })
      }

      if (rowExpectation.startsWith !== undefined && !actualTrimmed.startsWith(rowExpectation.startsWith)) {
        failures.push({
          path: `rows[${row}] (trimmed)`,
          expected: `startsWith(${rowExpectation.startsWith})`,
          actual: actualTrimmed,
          message: "Row did not start with expected text",
        })
      }

      if (rowExpectation.contains !== undefined && !actualTrimmed.includes(rowExpectation.contains)) {
        failures.push({
          path: `rows[${row}] (trimmed)`,
          expected: `contains(${rowExpectation.contains})`,
          actual: actualTrimmed,
          message: "Row did not contain expected text",
        })
      }
    }
  }

  if (expectation.cells) {
    for (const cellExpectation of expectation.cells) {
      const actual = result.renderer.getCell(cellExpectation.col, cellExpectation.row)
      if (actual !== cellExpectation.equals) {
        failures.push({
          path: `cells[${cellExpectation.col},${cellExpectation.row}]`,
          expected: cellExpectation.equals,
          actual,
          message: "Cell did not match expected character",
        })
      }
    }
  }

  if (expectation.textIncludes) {
    const text = result.renderer.getText(true)
    for (const expectedText of expectation.textIncludes) {
      if (!text.includes(expectedText)) {
        failures.push({
          path: "textIncludes",
          expected: expectedText,
          actual: text,
          message: "Screen text did not include expected substring",
        })
      }
    }
  }

  if (expectation.variables) {
    for (const [name, expected] of Object.entries(expectation.variables)) {
      const normalizedName = normalizeVariableName(name)
      const actual = result.state.variables[normalizedName]

      if (actual !== expected) {
        failures.push({
          path: `variables.${normalizedName}`,
          expected,
          actual,
          message: "Variable value did not match expected result",
        })
      }
    }
  }

  if (expectation.pixels) {
    for (const pixelExpectation of expectation.pixels) {
      const actual = result.renderer.getPixel(pixelExpectation.x, pixelExpectation.y)
      if (actual !== normalizeColorIndex(pixelExpectation.equals)) {
        failures.push({
          path: `pixels[${pixelExpectation.x},${pixelExpectation.y}]`,
          expected: normalizeColorIndex(pixelExpectation.equals),
          actual,
          message: "Pixel color did not match expected value",
        })
      }
    }
  }

  return failures
}

export const runAndAssertBasicScenario = async (
  scenario: BasicHarnessScenario,
  expectation: BasicExpectation
): Promise<{ result: BasicHarnessResult; failures: BasicAssertionFailure[] }> => {
  const result = await runBasicScenario(scenario)
  const failures = assertBasicExpectation(result, expectation)
  return { result, failures }
}

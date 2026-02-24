import { FontChip } from "./font-chip"
import { stringToAsciiCode } from "./ascii"

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

const PALETTE = [
  "#000000",
  "#1D2B53",
  "#7E2553",
  "#008751",
  "#AB5236",
  "#5F574F",
  "#C2C3C7",
  "#FFF1E8",
  "#FF004D",
  "#FFA300",
  "#FFEC27",
  "#00E436",
  "#29ADFF",
  "#83769C",
  "#FF77A8",
  "#FFCCAA",
]

export class PixelTextRenderer {
  readonly width = 256
  readonly height = 240
  readonly charWidth = 8
  readonly charHeight = 8
  readonly cols = this.width / this.charWidth
  readonly rows = this.height / this.charHeight

  private readonly ctx: CanvasRenderingContext2D
  private readonly font = new FontChip()
  private readonly tintedAtlases = new Map<number, HTMLCanvasElement>()
  private cursorX = 0
  private cursorY = 0
  private fgColor = 7
  private bgColor = 0

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.canvas.width = this.width
    this.canvas.height = this.height

    const context = this.canvas.getContext("2d")
    if (!context) {
      throw new Error("Canvas 2D context is not available")
    }
    context.imageSmoothingEnabled = false
    this.ctx = context
  }

  async init(fontUrl: string): Promise<void> {
    await this.font.load(fontUrl)
    this.clear(0)
  }

  clear(colorIndex = 0): void {
    const bg = this.resolveColor(colorIndex)
    this.ctx.fillStyle = bg
    this.ctx.fillRect(0, 0, this.width, this.height)
    this.cursorX = 0
    this.cursorY = 0
    this.bgColor = this.normalizeColorIndex(colorIndex)
  }

  setColor(fgColor: number, bgColor: number = this.bgColor): void {
    this.fgColor = this.normalizeColorIndex(fgColor)
    this.bgColor = this.normalizeColorIndex(bgColor)
  }

  locate(col: number, row: number): void {
    this.cursorX = clamp(Math.trunc(col), 0, this.cols - 1)
    this.cursorY = clamp(Math.trunc(row), 0, this.rows - 1)
  }

  write(text: string): void {
    for (const char of text) {
      if (char === "\n") {
        this.newLine()
        continue
      }

      this.drawChar(char)
      this.cursorX += 1
      if (this.cursorX >= this.cols) {
        this.newLine()
      }
    }
  }

  printLine(text = ""): void {
    this.write(text)
    this.newLine()
  }

  newLine(): void {
    this.cursorX = 0
    this.cursorY += 1
    if (this.cursorY >= this.rows) {
      this.scrollUp()
      this.cursorY = this.rows - 1
    }
  }

  tab(): void {
    const tabSize = 4
    const nextStop = Math.min(this.cols - 1, Math.ceil((this.cursorX + 1) / tabSize) * tabSize)
    while (this.cursorX < nextStop) {
      this.drawChar(" ")
      this.cursorX += 1
    }
  }

  pset(x: number, y: number, color: number = this.fgColor): void {
    const px = clamp(Math.trunc(x), 0, this.width - 1)
    const py = clamp(Math.trunc(y), 0, this.height - 1)
    this.ctx.fillStyle = this.resolveColor(color)
    this.ctx.fillRect(px, py, 1, 1)
  }

  line(x1: number, y1: number, x2: number, y2: number, color: number = this.fgColor): void {
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

  rect(x: number, y: number, width: number, height: number, color: number = this.fgColor): void {
    const rx = Math.trunc(x)
    const ry = Math.trunc(y)
    const rw = Math.max(0, Math.trunc(width))
    const rh = Math.max(0, Math.trunc(height))
    this.line(rx, ry, rx + rw, ry, color)
    this.line(rx, ry, rx, ry + rh, color)
    this.line(rx + rw, ry, rx + rw, ry + rh, color)
    this.line(rx, ry + rh, rx + rw, ry + rh, color)
  }

  private drawChar(char: string): void {
    const code = stringToAsciiCode(char)
    const glyph = this.font.getGlyph(code)
    const dx = this.cursorX * this.charWidth
    const dy = this.cursorY * this.charHeight

    this.ctx.fillStyle = this.resolveColor(this.bgColor)
    this.ctx.fillRect(dx, dy, this.charWidth, this.charHeight)

    if (!glyph) return

    const atlas = this.getTintedAtlas(this.fgColor)
    this.ctx.drawImage(
      atlas,
      glyph.sx,
      glyph.sy,
      glyph.sw,
      glyph.sh,
      dx,
      dy,
      this.charWidth,
      this.charHeight
    )
  }

  private getTintedAtlas(colorIndex: number): HTMLCanvasElement {
    const normalized = this.normalizeColorIndex(colorIndex)
    const cached = this.tintedAtlases.get(normalized)
    if (cached) {
      return cached
    }

    const canvas = document.createElement("canvas")
    canvas.width = this.font.image.width
    canvas.height = this.font.image.height
    const context = canvas.getContext("2d")
    if (!context) {
      throw new Error("Unable to create offscreen font atlas")
    }

    context.imageSmoothingEnabled = false
    context.drawImage(this.font.image, 0, 0)
    context.globalCompositeOperation = "source-in"
    context.fillStyle = this.resolveColor(normalized)
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.globalCompositeOperation = "source-over"

    this.tintedAtlases.set(normalized, canvas)
    return canvas
  }

  private scrollUp(): void {
    const imageData = this.ctx.getImageData(0, this.charHeight, this.width, this.height - this.charHeight)
    this.ctx.putImageData(imageData, 0, 0)
    this.ctx.fillStyle = this.resolveColor(this.bgColor)
    this.ctx.fillRect(0, this.height - this.charHeight, this.width, this.charHeight)
  }

  private normalizeColorIndex(value: number): number {
    const size = PALETTE.length
    const normalized = Math.trunc(value) % size
    return normalized < 0 ? normalized + size : normalized
  }

  private resolveColor(value: number): string {
    return PALETTE[this.normalizeColorIndex(value)]
  }
}

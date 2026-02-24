import { GLYPH_START_CODE, SUPPORTED_ASCII_CODES, normalizeAsciiCode } from "./ascii"

type GlyphRect = {
  sx: number
  sy: number
  sw: number
  sh: number
}

export class FontChip {
  readonly glyphWidth = 8
  readonly glyphHeight = 8
  readonly image = new Image()
  readonly codeToGlyph = new Map<number, GlyphRect>()
  private loaded = false

  async load(url: string): Promise<void> {
    if (this.loaded) return

    await new Promise<void>((resolve, reject) => {
      this.image.onload = () => resolve()
      this.image.onerror = () => reject(new Error(`Unable to load font image: ${url}`))
      this.image.src = url
    })

    const cols = Math.floor(this.image.width / this.glyphWidth)
    const rows = Math.floor(this.image.height / this.glyphHeight)
    const glyphCount = cols * rows
    const totalMapped = Math.min(glyphCount, SUPPORTED_ASCII_CODES.length)

    for (let index = 0; index < totalMapped; index += 1) {
      const code = SUPPORTED_ASCII_CODES[index]
      const col = index % cols
      const row = Math.floor(index / cols)
      this.codeToGlyph.set(code, {
        sx: col * this.glyphWidth,
        sy: row * this.glyphHeight,
        sw: this.glyphWidth,
        sh: this.glyphHeight,
      })
    }

    this.loaded = true
  }

  getGlyph(code: number): GlyphRect | null {
    const normalizedCode = normalizeAsciiCode(code)
    return this.codeToGlyph.get(normalizedCode) ?? this.codeToGlyph.get(GLYPH_START_CODE) ?? null
  }
}

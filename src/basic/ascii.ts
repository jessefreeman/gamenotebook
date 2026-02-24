export const GLYPH_START_CODE = 32

export const SUPPORTED_ASCII_CODES: number[] = [
  ...Array.from({ length: 126 - 32 + 1 }, (_, i) => i + 32),
  ...Array.from({ length: 172 - 161 + 1 }, (_, i) => i + 161),
  ...Array.from({ length: 255 - 174 + 1 }, (_, i) => i + 174),
]

export const normalizeAsciiCode = (code: number): number => {
  if (!Number.isFinite(code)) {
    return GLYPH_START_CODE
  }

  const rounded = Math.trunc(code)
  if (rounded < GLYPH_START_CODE) {
    return GLYPH_START_CODE
  }
  if (rounded > 255) {
    return 255
  }
  return rounded
}

export const stringToAsciiCode = (value: string): number => {
  if (!value) return GLYPH_START_CODE
  const code = value.codePointAt(0)
  return normalizeAsciiCode(code ?? GLYPH_START_CODE)
}

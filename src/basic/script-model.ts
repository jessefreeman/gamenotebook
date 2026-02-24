import { nanoid } from "nanoid"

export const LINE_ID_MARKER_PREFIX = "@id:"
export const REFERENCE_TOKEN_PREFIX = "{{L:"
export const REFERENCE_TOKEN_SUFFIX = "}}"

export type BasicScriptLine = {
  id: string
  number: number
  text: string
}

const SCRIPT_LINE_PATTERN = /^\s*(\d+)\s*(.*)$/
const LINE_ID_MARKER_PATTERN =
  /\s*(?:'|REM)\s*@id:([A-Za-z0-9_-]+)\s*$/i
const REFERENCE_TOKEN_PATTERN = /\{\{L:([A-Za-z0-9_-]+)\}\}/g

const newLineId = (): string => nanoid(10)

const normalizeNumber = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0

export const renumberLinesByTen = (
  lines: readonly BasicScriptLine[]
): BasicScriptLine[] => {
  return lines.map((line, index) => ({
    ...line,
    number: (index + 1) * 10,
  }))
}

export const parseEditableScript = (source: string): BasicScriptLine[] => {
  const parsed = source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((rawLine) => rawLine.replace(/\s+$/, ""))
    .filter((line) => line.trim().length > 0)
    .map((line): BasicScriptLine => {
      const idMatch = LINE_ID_MARKER_PATTERN.exec(line)
      const id = idMatch?.[1] ?? newLineId()
      const withoutId = idMatch ? line.slice(0, idMatch.index).trimEnd() : line
      const numbered = SCRIPT_LINE_PATTERN.exec(withoutId)
      if (numbered) {
        return {
          id,
          number: normalizeNumber(Number.parseInt(numbered[1], 10)),
          text: numbered[2] ?? "",
        }
      }
      return {
        id,
        number: 0,
        text: withoutId.trim(),
      }
    })

  if (parsed.length === 0) {
    return [
      {
        id: newLineId(),
        number: 10,
        text: "",
      },
    ]
  }

  return renumberLinesByTen(parsed)
}

export const serializeEditableScript = (
  lines: readonly BasicScriptLine[]
): string => {
  return lines
    .map((line) => {
      const base = `${line.number}${line.text ? ` ${line.text}` : ""}`
      return `${base} ' ${LINE_ID_MARKER_PREFIX}${line.id}`
    })
    .join("\n")
}

export const compileExecutableScript = (
  lines: readonly BasicScriptLine[]
): string => {
  const lineNumberById = new Map(lines.map((line) => [line.id, line.number]))

  const resolveReferences = (text: string): string => {
    return text
      .replace(REFERENCE_TOKEN_PATTERN, (_, referencedLineId: string) => {
        const lineNumber = lineNumberById.get(referencedLineId)
        return lineNumber ? String(lineNumber) : ""
      })
      .replace(/\s{2,}/g, " ")
      .trimEnd()
  }

  return lines
    .map((line) => {
      const executableText = resolveReferences(line.text)
      return `${line.number}${executableText ? ` ${executableText}` : ""}`
    })
    .join("\n")
}

export const createLineAfterIndex = (
  lines: readonly BasicScriptLine[],
  index: number
): BasicScriptLine[] => {
  const next = [...lines]
  const insertionIndex = Math.max(0, Math.min(index + 1, next.length))
  next.splice(insertionIndex, 0, {
    id: newLineId(),
    number: 0,
    text: "",
  })
  return renumberLinesByTen(next)
}

export const updateLineText = (
  lines: readonly BasicScriptLine[],
  lineId: string,
  text: string
): BasicScriptLine[] => {
  return lines.map((line) =>
    line.id === lineId
      ? {
          ...line,
          text,
        }
      : line
  )
}

export const reorderLineByNumberHint = (
  lines: readonly BasicScriptLine[],
  lineId: string,
  numberHint: number
): BasicScriptLine[] => {
  const decorated = lines.map((line, index) => ({
    line,
    index,
    hint: line.id === lineId ? normalizeNumber(numberHint) : line.number,
  }))

  decorated.sort((left, right) => {
    if (left.hint !== right.hint) {
      return left.hint - right.hint
    }
    return left.index - right.index
  })

  return renumberLinesByTen(decorated.map((entry) => entry.line))
}

export const moveLineBeforeTarget = (
  lines: readonly BasicScriptLine[],
  draggedLineId: string,
  targetLineId: string
): BasicScriptLine[] => {
  if (draggedLineId === targetLineId) {
    return [...lines]
  }

  const next = [...lines]
  const sourceIndex = next.findIndex((line) => line.id === draggedLineId)
  const targetIndex = next.findIndex((line) => line.id === targetLineId)

  if (sourceIndex < 0 || targetIndex < 0) {
    return [...lines]
  }

  const [movedLine] = next.splice(sourceIndex, 1)
  const destinationIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex
  next.splice(destinationIndex, 0, movedLine)
  return renumberLinesByTen(next)
}

export const removeLine = (
  lines: readonly BasicScriptLine[],
  lineId: string
): BasicScriptLine[] => {
  const next = lines.filter((line) => line.id !== lineId)
  const withoutReferences = next.map((line) => ({
    ...line,
    text: line.text
      .replace(
        new RegExp(
          `${REFERENCE_TOKEN_PREFIX}${lineId}${REFERENCE_TOKEN_SUFFIX}`,
          "g"
        ),
        ""
      )
      .replace(/\s{2,}/g, " ")
      .trim(),
  }))

  if (withoutReferences.length === 0) {
    return [
      {
        id: newLineId(),
        number: 10,
        text: "",
      },
    ]
  }

  return renumberLinesByTen(withoutReferences)
}

export const insertReferenceToken = (
  text: string,
  targetLineId: string,
  selectionStart: number,
  selectionEnd: number
): string => {
  const start = Math.max(0, selectionStart)
  const end = Math.max(start, selectionEnd)
  const token = `${REFERENCE_TOKEN_PREFIX}${targetLineId}${REFERENCE_TOKEN_SUFFIX}`
  return `${text.slice(0, start)}${token}${text.slice(end)}`
}

export const replaceGotoLikeTargetWithReference = (
  text: string,
  targetLineId: string
): string => {
  const token = `${REFERENCE_TOKEN_PREFIX}${targetLineId}${REFERENCE_TOKEN_SUFFIX}`
  const gotoPattern = /\b(GOTO|GOSUB)\s+([^\s:]+)?/i
  if (gotoPattern.test(text)) {
    return text.replace(gotoPattern, (_, keyword: string) => `${keyword} ${token}`)
  }
  return `${text}${text.endsWith(" ") || text.length === 0 ? "" : " "}${token}`
}

export const getLineNumberById = (
  lines: readonly BasicScriptLine[],
  lineId: string
): number | null => {
  const line = lines.find((entry) => entry.id === lineId)
  return line?.number ?? null
}

export const hasReferenceToken = (
  text: string,
  targetLineId: string
): boolean => {
  return text.includes(
    `${REFERENCE_TOKEN_PREFIX}${targetLineId}${REFERENCE_TOKEN_SUFFIX}`
  )
}


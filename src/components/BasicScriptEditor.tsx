import { For, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import type { BasicScriptLine } from "../basic/script-model"
import {
  compileExecutableScript,
  createLineAfterIndex,
  getLineNumberById,
  insertReferenceToken,
  moveLineBeforeTarget,
  parseEditableScript,
  removeLine,
  reorderLineByNumberHint,
  replaceGotoLikeTargetWithReference,
  serializeEditableScript,
  updateLineText,
} from "../basic/script-model"

const DRAG_KIND_REORDER = "application/x-gamenotepad-line-reorder"
const DRAG_KIND_REFERENCE = "application/x-gamenotepad-line-reference"

export type BasicScriptEditorApi = {
  jumpToScriptLine: (scriptLineNumber: number) => boolean
}

export const BasicScriptEditor = (props: {
  value: string
  onChange: (value: string) => void
  onExecutableChange?: (value: string) => void
  onApi?: (api: BasicScriptEditorApi | null) => void
}) => {
  const [getLines, setLines] = createSignal<BasicScriptLine[]>(
    parseEditableScript(props.value)
  )
  const lineInputRefs = new Map<string, HTMLInputElement>()

  const serialized = createMemo(() => serializeEditableScript(getLines()))
  const executable = createMemo(() => compileExecutableScript(getLines()))

  const setLineInputRef = (lineId: string, element: HTMLInputElement | undefined) => {
    if (!element) {
      lineInputRefs.delete(lineId)
      return
    }
    lineInputRefs.set(lineId, element)
  }

  const focusLineInput = (lineId: string) => {
    const element = lineInputRefs.get(lineId)
    if (!element) return
    window.setTimeout(() => {
      element.focus()
      const end = element.value.length
      element.setSelectionRange(end, end)
    }, 0)
  }

  createEffect(() => {
    if (serialized() !== props.value) {
      props.onChange(serialized())
    }
    props.onExecutableChange?.(executable())
  })

  createEffect(() => {
    if (props.value === serialized()) return
    setLines(parseEditableScript(props.value))
  })

  createEffect(() => {
    const api: BasicScriptEditorApi = {
      jumpToScriptLine(scriptLineNumber: number) {
        const target = getLines().find((line) => line.number === scriptLineNumber)
        if (!target) return false
        focusLineInput(target.id)
        return true
      },
    }
    props.onApi?.(api)
  })

  onCleanup(() => {
    props.onApi?.(null)
  })

  const updateLines = (next: BasicScriptLine[]) => {
    setLines(next)
  }

  const commitLineNumber = (lineId: string, value: string) => {
    const parsed = Number.parseInt(value.trim(), 10)
    if (!Number.isInteger(parsed)) {
      return
    }
    updateLines(reorderLineByNumberHint(getLines(), lineId, parsed))
  }

  const addLineAfter = (lineId: string) => {
    const lines = getLines()
    const index = lines.findIndex((line) => line.id === lineId)
    if (index < 0) return
    const next = createLineAfterIndex(lines, index)
    const inserted = next[index + 1]
    updateLines(next)
    if (inserted) {
      focusLineInput(inserted.id)
    }
  }

  const removeCurrentLine = (lineId: string) => {
    const lines = getLines()
    const index = lines.findIndex((line) => line.id === lineId)
    const next = removeLine(lines, lineId)
    updateLines(next)
    const fallback = next[Math.max(0, Math.min(index, next.length - 1))]
    if (fallback) {
      focusLineInput(fallback.id)
    }
  }

  const onLineDrop = (targetLineId: string, event: DragEvent) => {
    event.preventDefault()
    const draggedLineId = event.dataTransfer?.getData(DRAG_KIND_REORDER)
    if (!draggedLineId) return
    updateLines(moveLineBeforeTarget(getLines(), draggedLineId, targetLineId))
  }

  const onReferenceDrop = (
    line: BasicScriptLine,
    event: DragEvent & { currentTarget: HTMLInputElement }
  ) => {
    event.preventDefault()
    const targetLineId = event.dataTransfer?.getData(DRAG_KIND_REFERENCE)
    if (!targetLineId || targetLineId === line.id) return

    const input = event.currentTarget
    const selectionStart = input.selectionStart ?? line.text.length
    const selectionEnd = input.selectionEnd ?? selectionStart

    const nextText = /\b(GOTO|GOSUB)\b/i.test(line.text)
      ? replaceGotoLikeTargetWithReference(line.text, targetLineId)
      : insertReferenceToken(line.text, targetLineId, selectionStart, selectionEnd)

    updateLines(updateLineText(getLines(), line.id, nextText))
    focusLineInput(line.id)
  }

  const resolveReferencePreview = (text: string) => {
    return text.replace(/\{\{L:([A-Za-z0-9_-]+)\}\}/g, (_, lineId: string) => {
      const lineNumber = getLineNumberById(getLines(), lineId)
      return lineNumber ? String(lineNumber) : ""
    })
  }

  return (
    <div class="h-full overflow-y-auto font-mono text-sm">
      <div class="sticky top-0 z-[1] border-b bg-zinc-50 dark:bg-zinc-800 px-2 h-8 flex items-center text-[11px] text-zinc-500">
        <span class="w-[170px] shrink-0">Line Controls</span>
        <span class="truncate">
          Drag line badge into code to insert linked line references (`{"{{L:...}}"}`).
        </span>
      </div>

      <For each={getLines()}>
        {(line) => {
          const resolvedPreview = createMemo(() => resolveReferencePreview(line.text))
          const hasDynamicReference = createMemo(() =>
            /\{\{L:[A-Za-z0-9_-]+\}\}/.test(line.text)
          )

          return (
            <div
              class="border-b px-2 py-1"
              onDragOver={(event) => {
                if (event.dataTransfer?.types.includes(DRAG_KIND_REORDER)) {
                  event.preventDefault()
                }
              }}
              onDrop={(event) => onLineDrop(line.id, event)}
            >
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  draggable
                  title="Drag to reorder line"
                  class="cursor h-7 w-7 shrink-0 inline-flex items-center justify-center border rounded text-zinc-500"
                  onDragStart={(event) => {
                    event.dataTransfer?.setData(DRAG_KIND_REORDER, line.id)
                    event.dataTransfer?.setData("text/plain", line.id)
                    if (event.dataTransfer) {
                      event.dataTransfer.effectAllowed = "move"
                    }
                  }}
                >
                  <span class="i-ic:outline-drag-indicator h-4 w-4"></span>
                </button>

                <input
                  value={line.number}
                  class="w-16 h-7 text-right border rounded px-1 bg-transparent"
                  onBlur={(event) => commitLineNumber(line.id, event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      commitLineNumber(line.id, event.currentTarget.value)
                      event.currentTarget.blur()
                    }
                  }}
                />

                <button
                  type="button"
                  draggable
                  title="Drag this line number into code to create a linked reference"
                  class="cursor h-7 px-2 shrink-0 inline-flex items-center justify-center border rounded bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-200 dark:border-blue-800"
                  onDragStart={(event) => {
                    event.dataTransfer?.setData(DRAG_KIND_REFERENCE, line.id)
                    event.dataTransfer?.setData("text/plain", String(line.number))
                    if (event.dataTransfer) {
                      event.dataTransfer.effectAllowed = "copy"
                    }
                  }}
                >
                  {line.number}
                </button>

                <input
                  ref={(element) => setLineInputRef(line.id, element)}
                  value={line.text}
                  spellcheck={false}
                  class="input h-7 flex-1 font-mono"
                  onInput={(event) =>
                    updateLines(
                      updateLineText(getLines(), line.id, event.currentTarget.value)
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      addLineAfter(line.id)
                    }
                    if (
                      event.key === "Backspace" &&
                      event.currentTarget.value.length === 0 &&
                      getLines().length > 1
                    ) {
                      event.preventDefault()
                      removeCurrentLine(line.id)
                    }
                  }}
                  onDragOver={(event) => {
                    if (event.dataTransfer?.types.includes(DRAG_KIND_REFERENCE)) {
                      event.preventDefault()
                    }
                  }}
                  onDrop={(event) =>
                    onReferenceDrop(
                      line,
                      event as DragEvent & { currentTarget: HTMLInputElement }
                    )
                  }
                />

                <button
                  type="button"
                  class="cursor h-7 w-7 shrink-0 inline-flex items-center justify-center border rounded text-zinc-500"
                  title="Add line below"
                  onClick={() => addLineAfter(line.id)}
                >
                  <span class="i-ic:round-add h-4 w-4"></span>
                </button>

                <button
                  type="button"
                  class="cursor h-7 w-7 shrink-0 inline-flex items-center justify-center border rounded text-zinc-500 disabled:opacity-40"
                  title="Delete line"
                  disabled={getLines().length <= 1}
                  onClick={() => removeCurrentLine(line.id)}
                >
                  <span class="i-iconoir:trash h-4 w-4"></span>
                </button>
              </div>

              <div class="pl-[184px] text-[11px] text-zinc-500 truncate">
                <span>
                  Preview: {line.number}
                  {resolvedPreview().trim() ? ` ${resolvedPreview()}` : ""}
                </span>
                <span class="ml-2" classList={{ "text-blue-500": hasDynamicReference() }}>
                  {hasDynamicReference() ? "linked refs" : ""}
                </span>
              </div>
            </div>
          )
        }}
      </For>
    </div>
  )
}

import { basicSetup, EditorView } from "codemirror"
import { Compartment, EditorState, type Extension } from "@codemirror/state"
import { createEffect, createSignal, onCleanup, onMount } from "solid-js"
import { githubDark, githubLight } from "@uiw/codemirror-theme-github"
import { useDarkMode } from "../lib/darkmode"

const parseDocumentLineNumber = (
  element: HTMLElement,
  fallbackText?: string | null
): number | null => {
  const fromText = Number.parseInt((fallbackText ?? element.textContent) || "", 10)
  if (Number.isInteger(fromText) && fromText > 0) {
    return fromText
  }

  return null
}

const collectSelectedLineNumbers = (state: EditorState): number[] => {
  const lineNumbers = new Set<number>()

  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number
    const endAnchor = range.to > range.from ? range.to - 1 : range.to
    const endLine = state.doc.lineAt(endAnchor).number
    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
      lineNumbers.add(lineNumber)
    }
  }

  return [...lineNumbers].sort((a, b) => a - b)
}

const toggleLineComments = (view: EditorView): void => {
  const lineNumbers = collectSelectedLineNumbers(view.state)
  if (lineNumbers.length === 0) return

  const lineInfos = lineNumbers.map((lineNumber) => view.state.doc.line(lineNumber))
  const nonEmptyLines = lineInfos.filter((line) => line.text.trim().length > 0)

  const allCommented =
    nonEmptyLines.length > 0 &&
    nonEmptyLines.every((line) => /^\s*'/.test(line.text))

  const changes = lineInfos
    .map((line) => {
      if (allCommented) {
        const match = /^(\s*)' ?/.exec(line.text)
        if (!match) return null
        const from = line.from + match[1].length
        return {
          from,
          to: from + (match[0].length - match[1].length),
          insert: "",
        }
      }

      return {
        from: line.from,
        insert: "' ",
      }
    })
    .filter((change): change is { from: number; to?: number; insert: string } =>
      change !== null
    )

  if (changes.length === 0) return
  view.dispatch({ changes })
}

export const Editor = (props: {
  value: string
  onChange: (newValue: string) => void
  extensions?: Extension[]
  onViewReady?: (view: EditorView) => void
  onTemplateTrigger?: () => void
  onPasteTransform?: (pastedText: string) => string | null
}) => {
  let el: HTMLDivElement | undefined
  const [getView, setView] = createSignal<EditorView | undefined>()
  const isDarkMode = useDarkMode()
  const themeCompartment = new Compartment()
  const extensionCompartment = new Compartment()

  onMount(() => {
    const handleUpdate = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return
      const value = update.state.doc.toString()
      props.onChange(value)
    })

    const applyPasteTransform = (
      event: ClipboardEvent,
      view: EditorView
    ): boolean => {
      if (!props.onPasteTransform || event.defaultPrevented) return false

      const pastedText = event.clipboardData?.getData("text/plain")
      if (!pastedText) return false

      const transformedText = props.onPasteTransform(pastedText)
      if (typeof transformedText !== "string") {
        return false
      }

      if (transformedText === pastedText) {
        return false
      }

      const selection = view.state.selection.main
      view.dispatch({
        changes: {
          from: selection.from,
          to: selection.to,
          insert: transformedText,
        },
        selection: {
          anchor: selection.from + transformedText.length,
        },
        scrollIntoView: true,
      })
      event.preventDefault()
      return true
    }

    const pasteEventExtension = EditorView.domEventHandlers({
      paste: (event, view) => applyPasteTransform(event, view),
    })
    const view = new EditorView({
      parent: el,
      state: EditorState.create({
        doc: "",
        extensions: [
          themeCompartment.of(isDarkMode() ? githubDark : githubLight),
          extensionCompartment.of(props.extensions || []),
          basicSetup,
          handleUpdate,
          pasteEventExtension,
          EditorView.lineWrapping,
        ],
      }),
    })
    setView(view)

    const handleGutterMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const lineElement = target?.closest(".cm-lineNumbers .cm-gutterElement")
      if (!lineElement) return

      const documentLineNumber = parseDocumentLineNumber(lineElement as HTMLElement)
      if (!documentLineNumber) return

      const line = view.state.doc.line(documentLineNumber)
      view.dispatch({
        selection: { anchor: line.from },
        scrollIntoView: true,
      })
      view.focus()
      event.preventDefault()
    }

    const handleTemplateTriggerKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "/" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey
      ) {
        event.preventDefault()
        toggleLineComments(view)
        return
      }

      if (!props.onTemplateTrigger) return
      if (event.defaultPrevented) return
      if (event.key !== "/") return
      if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) {
        return
      }

      const selection = view.state.selection.main
      if (!selection.empty) return

      const cursor = selection.from
      if (cursor > 0) {
        const prevChar = view.state.sliceDoc(cursor - 1, cursor)
        if (!/\s/.test(prevChar)) {
          return
        }
      }

      event.preventDefault()
      props.onTemplateTrigger()
    }

    const handlePaste = (event: ClipboardEvent) => {
      applyPasteTransform(event, view)
    }

    view.dom.addEventListener("mousedown", handleGutterMouseDown)
    view.dom.addEventListener("keydown", handleTemplateTriggerKeyDown)
    view.dom.addEventListener("paste", handlePaste, true)
    view.contentDOM.addEventListener("paste", handlePaste, true)
    props.onViewReady?.(view)

    onCleanup(() => {
      view.dom.removeEventListener("mousedown", handleGutterMouseDown)
      view.dom.removeEventListener("keydown", handleTemplateTriggerKeyDown)
      view.dom.removeEventListener("paste", handlePaste, true)
      view.contentDOM.removeEventListener("paste", handlePaste, true)
      view.destroy()
    })

    createEffect(() => {
      const view = getView()
      if (!view) return
      const oldValue = view.state.doc.toString()
      if (props.value !== oldValue) {
        const hadFocus = view.hasFocus
        const selection = view.state.selection.main
        const nextAnchor = Math.min(selection.anchor, props.value.length)
        const nextHead = Math.min(selection.head, props.value.length)
        view.dispatch({
          changes: { from: 0, to: oldValue.length, insert: props.value },
          selection: { anchor: nextAnchor, head: nextHead },
        })
        if (hadFocus) {
          view.focus()
        }
      }
    })

    createEffect(() => {
      const view = getView()
      if (!view) return
      view.dispatch({
        effects: themeCompartment.reconfigure(
          isDarkMode() ? githubDark : githubLight
        ),
      })
    })

    createEffect(() => {
      const view = getView()
      if (!view) return
      view.dispatch({
        effects: extensionCompartment.reconfigure(props.extensions || []),
      })
    })
  })

  return <div class="h-full" ref={el}></div>
}

import { basicSetup, EditorView } from "codemirror"
import { EditorState, type Extension } from "@codemirror/state"
import { createEffect, createSignal, onCleanup, onMount } from "solid-js"
import { githubDark, githubLight } from "@uiw/codemirror-theme-github"
import { useDarkMode } from "../lib/darkmode"

const BASIC_LINE_PATTERN = /^\s*(\d+)\b/

const parseDocumentLineNumber = (
  element: HTMLElement,
  fallbackText?: string | null
): number | null => {
  const fromData = Number.parseInt(element.dataset.docLine || "", 10)
  if (Number.isInteger(fromData) && fromData > 0) {
    return fromData
  }

  const fromText = Number.parseInt((fallbackText ?? element.textContent) || "", 10)
  if (Number.isInteger(fromText) && fromText > 0) {
    return fromText
  }

  return null
}

const updateGutterScriptLineLabels = (view: EditorView): void => {
  const gutterElements = view.dom.querySelectorAll<HTMLElement>(
    ".cm-lineNumbers .cm-gutterElement"
  )

  gutterElements.forEach((element) => {
    const documentLineNumber = parseDocumentLineNumber(element)
    if (!documentLineNumber) {
      return
    }

    const line = view.state.doc.line(documentLineNumber)
    const match = BASIC_LINE_PATTERN.exec(line.text)
    const label = match?.[1] ?? String(documentLineNumber)
    element.dataset.docLine = String(documentLineNumber)
    element.textContent = label
  })
}

export const Editor = (props: {
  value: string
  onChange: (newValue: string) => void
  extensions?: Extension[]
  onViewReady?: (view: EditorView) => void
}) => {
  let el: HTMLDivElement | undefined
  const [getView, setView] = createSignal<EditorView | undefined>()
  const isDarkMode = useDarkMode()

  onMount(() => {
    let rafHandle = 0
    const requestGutterLabelUpdate = (view: EditorView) => {
      if (rafHandle) return
      rafHandle = window.requestAnimationFrame(() => {
        rafHandle = 0
        updateGutterScriptLineLabels(view)
      })
    }

    const handleUpdate = EditorView.updateListener.of((update) => {
      const value = update.state.doc.toString()
      props.onChange(value)
      requestGutterLabelUpdate(update.view)
    })

    const createView = () => {
      const view = new EditorView({
        parent: el,
        state: EditorState.create({
          doc: "",
          extensions: [
            isDarkMode() ? githubDark : githubLight,
            basicSetup,
            handleUpdate,
            EditorView.lineWrapping,
            ...(props.extensions || []),
          ],
        }),
      })

      const handleGutterMouseDown = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null
        const lineElement = target?.closest(".cm-lineNumbers .cm-gutterElement")
        if (!lineElement) return

        const documentLineNumber = parseDocumentLineNumber(
          lineElement as HTMLElement,
          (lineElement as HTMLElement).dataset.docLine ||
            (lineElement as HTMLElement).textContent
        )
        if (!documentLineNumber) return

        const line = view.state.doc.line(documentLineNumber)
        view.dispatch({
          selection: { anchor: line.from },
          scrollIntoView: true,
        })
        view.focus()
        event.preventDefault()
      }

      view.dom.addEventListener("mousedown", handleGutterMouseDown)
      props.onViewReady?.(view)
      requestGutterLabelUpdate(view)

      onCleanup(() => {
        if (rafHandle) {
          window.cancelAnimationFrame(rafHandle)
          rafHandle = 0
        }
        view.dom.removeEventListener("mousedown", handleGutterMouseDown)
      })

      return view
    }

    createEffect(() => {
      const view = createView()
      setView(view)

      onCleanup(() => {
        view.destroy()
      })
    })

    createEffect(() => {
      const view = getView()
      if (!view) return
      const oldValue = view.state.doc.toString()
      if (props.value !== oldValue) {
        view.dispatch({
          changes: { from: 0, to: oldValue.length, insert: props.value },
        })
        requestGutterLabelUpdate(view)
      }
    })
  })

  return <div class="h-full" ref={el}></div>
}

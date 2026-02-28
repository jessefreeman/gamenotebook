import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js"
import { BasicRuntime } from "../basic/interpreter"
import { PixelTextRenderer } from "../basic/renderer"

const fontUrl = new URL("../../large.font.png", import.meta.url).href

export const BasicRunnerCanvas = (props: {
  source: string
  snippetName: string
  runVersion: number
  class?: string
  setDocumentTitle?: boolean
}) => {
  const [getWaitingForInput, setWaitingForInput] = createSignal(false)
  const [getInputCursorStyle, setInputCursorStyle] = createSignal<string | null>(
    null
  )
  const [getRuntimeReady, setRuntimeReady] = createSignal(false)

  let hostEl: HTMLDivElement | undefined
  let canvasEl: HTMLCanvasElement | undefined
  let renderer: PixelTextRenderer | null = null
  let runtime: BasicRuntime | null = null
  let pendingInputResolve: ((value: string) => void) | null = null
  let pendingInputValue = ""
  const keyQueue: string[] = []

  const updateInputCursorStyle = () => {
    if (
      !renderer ||
      !hostEl ||
      !canvasEl ||
      !pendingInputResolve ||
      !getWaitingForInput()
    ) {
      setInputCursorStyle(null)
      return
    }

    const hostRect = hostEl.getBoundingClientRect()
    const canvasRect = canvasEl.getBoundingClientRect()
    const cursor = renderer.getCursor()
    const cellWidth = canvasRect.width / renderer.cols
    const cellHeight = canvasRect.height / renderer.rows
    const left = canvasRect.left - hostRect.left + cursor.col * cellWidth
    const top = canvasRect.top - hostRect.top + cursor.row * cellHeight

    setInputCursorStyle(
      `left:${left}px;top:${top}px;width:${cellWidth}px;height:${cellHeight}px;`
    )
  }

  const stopRuntime = () => {
    runtime?.stop()
    runtime = null
    if (pendingInputResolve) {
      pendingInputResolve("")
      pendingInputResolve = null
    }
    pendingInputValue = ""
    setWaitingForInput(false)
    setInputCursorStyle(null)
  }

  const runSource = async () => {
    if (!renderer) return
    const activeRenderer = renderer

    stopRuntime()

    const localRuntime = new BasicRuntime({
      renderer: activeRenderer,
      requestInput: (prompt: string) => {
        activeRenderer.write(prompt)
        pendingInputValue = ""
        setWaitingForInput(true)
        return new Promise<string>((resolve) => {
          pendingInputResolve = resolve
          updateInputCursorStyle()
        })
      },
      consumeKey: () => keyQueue.shift() ?? null,
      handlesInputEcho: true,
    })

    runtime = localRuntime
    activeRenderer.clear(0)
    activeRenderer.setColor(7, 0)

    try {
      await localRuntime.run(props.source)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown runtime error"
      renderer.printLine(`ERR: ${message}`)
    } finally {
      if (runtime === localRuntime) {
        runtime = null
      }
      if (pendingInputResolve) {
        pendingInputResolve("")
        pendingInputResolve = null
      }
      pendingInputValue = ""
      setWaitingForInput(false)
      setInputCursorStyle(null)
    }

    if (props.setDocumentTitle) {
      document.title = props.snippetName
    }
  }

  onMount(async () => {
    if (!canvasEl) return

    renderer = new PixelTextRenderer(canvasEl)
    try {
      await renderer.init(fontUrl)
      setRuntimeReady(true)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Font initialization failed"
      renderer.clear(0)
      renderer.setColor(8, 0)
      renderer.printLine(`ERR: ${message}`)
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return
      if (pendingInputResolve) {
        if (event.metaKey || event.ctrlKey || event.altKey) {
          return
        }

        if (event.key === "Enter") {
          event.preventDefault()
          renderer?.newLine()
          const resolve = pendingInputResolve
          pendingInputResolve = null
          const value = pendingInputValue.toUpperCase()
          pendingInputValue = ""
          setWaitingForInput(false)
          setInputCursorStyle(null)
          resolve(value)
          return
        }

        if (event.key === "Backspace") {
          event.preventDefault()
          if (pendingInputValue.length > 0) {
            pendingInputValue = pendingInputValue.slice(0, -1)
            renderer?.backspace()
            updateInputCursorStyle()
          }
          return
        }

        if (event.key.length === 1) {
          event.preventDefault()
          const nextChar = event.key.toUpperCase()
          pendingInputValue += nextChar
          renderer?.write(nextChar)
          updateInputCursorStyle()
        }
        return
      }

      if (event.key.length === 1) {
        keyQueue.push(event.key.toUpperCase())
      } else if (event.key === "Enter") {
        keyQueue.push("\n")
      } else if (event.key === "Backspace") {
        keyQueue.push("\b")
      }
    }

    const handleResize = () => {
      updateInputCursorStyle()
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("resize", handleResize)
    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("resize", handleResize)
      stopRuntime()
    })
  })

  createEffect(() => {
    props.runVersion
    if (!getRuntimeReady()) return
    void runSource()
  })

  return (
    <div
      class={
        props.class ||
        "h-full w-full bg-black overflow-hidden flex items-center justify-center relative"
      }
      ref={hostEl}
    >
      <canvas
        ref={canvasEl}
        width={256}
        height={240}
        style="width:min(100%, calc(100vh * 256 / 240));height:min(100%, calc(100vw * 240 / 256));max-height:100%;image-rendering:pixelated;"
      />

      <Show when={getInputCursorStyle() && getWaitingForInput()}>
        <div
          class="basic-input-cursor absolute pointer-events-none bg-white/90"
          style={getInputCursorStyle()!}
        />
      </Show>
    </div>
  )
}

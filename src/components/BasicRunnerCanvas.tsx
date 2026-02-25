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
  const [getWaitingPrompt, setWaitingPrompt] = createSignal<string | null>(null)
  const [getInputValue, setInputValue] = createSignal("")
  const [getRuntimeReady, setRuntimeReady] = createSignal(false)

  let canvasEl: HTMLCanvasElement | undefined
  let inputEl: HTMLInputElement | undefined
  let renderer: PixelTextRenderer | null = null
  let runtime: BasicRuntime | null = null
  let pendingInputResolve: ((value: string) => void) | null = null
  const keyQueue: string[] = []

  const stopRuntime = () => {
    runtime?.stop()
    runtime = null
    if (pendingInputResolve) {
      pendingInputResolve("")
      pendingInputResolve = null
    }
    setWaitingPrompt(null)
    setInputValue("")
  }

  const submitInput = (event: SubmitEvent) => {
    event.preventDefault()
    if (!pendingInputResolve) return

    pendingInputResolve(getInputValue())
    pendingInputResolve = null
    setWaitingPrompt(null)
    setInputValue("")
  }

  const runSource = async () => {
    if (!renderer) return

    stopRuntime()

    const localRuntime = new BasicRuntime({
      renderer,
      requestInput: (prompt: string) => {
        setWaitingPrompt(prompt)
        setInputValue("")
        return new Promise<string>((resolve) => {
          pendingInputResolve = resolve
          globalThis.setTimeout(() => inputEl?.focus(), 0)
        })
      },
      consumeKey: () => keyQueue.shift() ?? null,
    })

    runtime = localRuntime
    renderer.clear(0)
    renderer.setColor(7, 0)

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
      setWaitingPrompt(null)
      setInputValue("")
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
      if (getWaitingPrompt()) return
      if (event.key.length === 1) {
        keyQueue.push(event.key)
      } else if (event.key === "Enter") {
        keyQueue.push("\n")
      } else if (event.key === "Backspace") {
        keyQueue.push("\b")
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown)
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
    >
      <canvas
        ref={canvasEl}
        width={256}
        height={240}
        style="width:min(100%, calc(100vh * 256 / 240));height:min(100%, calc(100vw * 240 / 256));max-height:100%;image-rendering:pixelated;"
      />

      <Show when={getWaitingPrompt()}>
        <form
          onSubmit={submitInput}
          class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/90 border border-white/20 rounded px-3 py-2 flex items-center gap-2 text-xs text-white w-[min(92vw,520px)]"
        >
          <label class="shrink-0 truncate max-w-[45%]">{getWaitingPrompt()}</label>
          <input
            ref={inputEl}
            value={getInputValue()}
            onInput={(event) => setInputValue(event.currentTarget.value)}
            class="flex-1 bg-black border border-white/30 rounded px-2 py-1 outline-none"
          />
          <button
            type="submit"
            class="border border-white/40 rounded px-2 py-1 uppercase tracking-wide"
          >
            Enter
          </button>
        </form>
      </Show>
    </div>
  )
}

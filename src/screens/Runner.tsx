import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { BasicRuntime } from "../basic/interpreter"
import { PixelTextRenderer } from "../basic/renderer"
import {
  BASIC_RUNNER_STORAGE_KEY,
  decodeRunnerPayload,
} from "../basic/runner-payload"

const fontUrl = new URL("../../large.font.png", import.meta.url).href

export const Runner = () => {
  const [getWaitingPrompt, setWaitingPrompt] = createSignal<string | null>(null)
  const [getInputValue, setInputValue] = createSignal("")

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

  const runSource = async (source: string, snippetName: string) => {
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
      await localRuntime.run(source)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown runtime error"
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

    document.title = snippetName
  }

  onMount(async () => {
    if (!canvasEl) {
      return
    }

    renderer = new PixelTextRenderer(canvasEl)
    try {
      await renderer.init(fontUrl)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Font initialization failed"
      renderer.clear(0)
      renderer.setColor(8, 0)
      renderer.printLine(`ERR: ${message}`)
      return
    }

    const runFromStorage = async () => {
      const payload = decodeRunnerPayload(localStorage.getItem(BASIC_RUNNER_STORAGE_KEY))
      if (!payload) {
        renderer?.clear(0)
        renderer?.setColor(7, 0)
        return
      }
      await runSource(payload.source, payload.snippetName)
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== BASIC_RUNNER_STORAGE_KEY) return
      const payload = decodeRunnerPayload(event.newValue)
      if (!payload) return
      void runSource(payload.source, payload.snippetName)
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

    window.addEventListener("storage", handleStorage)
    window.addEventListener("keydown", handleKeyDown)

    await runFromStorage()

    onCleanup(() => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener("keydown", handleKeyDown)
      stopRuntime()
    })
  })

  return (
    <div class="h-screen w-screen bg-black overflow-hidden flex items-center justify-center relative">
      <canvas
        ref={canvasEl}
        width={256}
        height={240}
        style="width:min(100vw, calc(100vh * 256 / 240));height:min(100vh, calc(100vw * 240 / 256));image-rendering:pixelated;"
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

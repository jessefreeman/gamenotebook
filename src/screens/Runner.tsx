import { onCleanup, onMount } from "solid-js"
import { BasicRuntime } from "../basic/interpreter"
import { PixelTextRenderer } from "../basic/renderer"
import {
  BASIC_RUNNER_STORAGE_KEY,
  decodeRunnerPayload,
} from "../basic/runner-payload"

const fontUrl = new URL("../../large.font.png", import.meta.url).href

export const Runner = () => {
  let canvasEl: HTMLCanvasElement | undefined
  let renderer: PixelTextRenderer | null = null
  let runtime: BasicRuntime | null = null
  const keyQueue: string[] = []

  const stopRuntime = () => {
    runtime?.stop()
    runtime = null
  }

  const runSource = async (source: string, snippetName: string) => {
    if (!renderer) return

    stopRuntime()

    const localRuntime = new BasicRuntime({
      renderer,
      requestInput: async (prompt: string) => window.prompt(prompt, "") ?? "",
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
    <div class="h-screen w-screen bg-black overflow-hidden flex items-center justify-center">
      <canvas
        ref={canvasEl}
        width={256}
        height={240}
        style="width:min(100vw, calc(100vh * 256 / 240));height:min(100vh, calc(100vw * 240 / 256));image-rendering:pixelated;"
      />
    </div>
  )
}

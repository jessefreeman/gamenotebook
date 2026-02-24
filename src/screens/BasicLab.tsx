import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { Editor } from "../components/Editor"
import { BasicRuntime } from "../basic/interpreter"
import { PixelTextRenderer } from "../basic/renderer"

const STARTER_PROGRAM = `CLS
COLOR 12,0
LOCATE 2,2
PRINT "GameNotebook BASIC MVP"
COLOR 7,0
PRINT "WHAT IS YOUR NAME";
INPUT N$
CLS
LOCATE 2,2
PRINT "HELLO, ";N$
PRINT "PRESS A KEY:"
K$ = INKEY$
IF K$ = "" THEN 12
PRINT "YOU PRESSED: ";K$
GOTO 11
`

const fontUrl = new URL("../../large.font.png", import.meta.url).href

export const BasicLab = () => {
  const [getSource, setSource] = createSignal(STARTER_PROGRAM)
  const [getStatus, setStatus] = createSignal("Loading font...")
  const [getError, setError] = createSignal<string | null>(null)
  const [getRuntimeReady, setRuntimeReady] = createSignal(false)
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

  const runProgram = async () => {
    if (!renderer) return

    stopRuntime()
    setError(null)
    setStatus("Running...")

    const localRuntime = new BasicRuntime({
      renderer,
      requestInput: (prompt: string) => {
        setWaitingPrompt(prompt)
        setInputValue("")
        return new Promise<string>((resolve) => {
          pendingInputResolve = resolve
          window.setTimeout(() => inputEl?.focus(), 0)
        })
      },
      consumeKey: () => keyQueue.shift() ?? null,
      onLog: (message: string) => {
        console.log("[BASIC]", message)
      },
    })

    runtime = localRuntime

    try {
      await localRuntime.run(getSource())
      if (runtime === localRuntime) {
        setStatus("Program finished")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown runtime error"
      setError(message)
      renderer.printLine(`ERR: ${message}`)
      setStatus("Runtime error")
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
  }

  const submitInput = (event: SubmitEvent) => {
    event.preventDefault()
    if (!pendingInputResolve) return
    const value = getInputValue()
    pendingInputResolve(value)
    pendingInputResolve = null
    setWaitingPrompt(null)
    setInputValue("")
  }

  onMount(async () => {
    if (!canvasEl) {
      setError("Canvas was not initialized")
      return
    }

    renderer = new PixelTextRenderer(canvasEl)
    try {
      await renderer.init(fontUrl)
      renderer.setColor(11, 0)
      renderer.printLine("GameNotebook BASIC ready.")
      renderer.setColor(7, 0)
      renderer.printLine("Press Run to execute.")
      setRuntimeReady(true)
      setStatus("Ready")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Font initialization failed"
      setError(message)
      setStatus("Font load failed")
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

  return (
    <div class="h-screen flex flex-col">
      <div class="h-10 border-b px-3 flex items-center justify-between text-sm">
        <div class="font-medium">GameNotebook BASIC Lab</div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void runProgram()
            }}
            disabled={!getRuntimeReady()}
            class="cursor border rounded-lg h-8 px-3 disabled:opacity-50"
          >
            Run
          </button>
          <button
            type="button"
            onClick={stopRuntime}
            class="cursor border rounded-lg h-8 px-3"
          >
            Stop
          </button>
          <button
            type="button"
            onClick={() => {
              renderer?.clear(0)
              renderer?.setColor(7, 0)
              setError(null)
              setStatus("Ready")
            }}
            class="cursor border rounded-lg h-8 px-3"
          >
            Clear Screen
          </button>
        </div>
      </div>

      <div class="h-8 px-3 border-b text-xs flex items-center justify-between">
        <span>Status: {getStatus()}</span>
        <Show when={getError()}>
          <span class="text-red-500">Error: {getError()}</span>
        </Show>
      </div>

      <div class="flex-1 min-h-0 flex">
        <div class="w-1/2 min-h-0 border-r">
          <Editor value={getSource()} onChange={setSource} />
        </div>

        <div class="w-1/2 min-h-0 p-3 flex flex-col gap-3">
          <div class="border rounded-lg h-full min-h-0 flex items-center justify-center bg-black">
            <canvas
              ref={canvasEl}
              width={256}
              height={240}
              style={{
                width: "100%",
                "max-width": "640px",
                "aspect-ratio": "256 / 240",
                "image-rendering": "pixelated",
                "object-fit": "contain",
              }}
            />
          </div>

          <form onSubmit={submitInput} class="border rounded-lg p-2 flex items-center gap-2">
            <label class="text-xs shrink-0">INPUT</label>
            <input
              ref={inputEl}
              value={getInputValue()}
              onInput={(event) => setInputValue(event.currentTarget.value)}
              disabled={!getWaitingPrompt()}
              placeholder={getWaitingPrompt() ? `Respond to: ${getWaitingPrompt()}` : "Program is not waiting for INPUT"}
              class="input flex-1 text-sm"
            />
            <button
              type="submit"
              disabled={!getWaitingPrompt()}
              class="cursor border rounded-lg h-8 px-3 text-sm disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

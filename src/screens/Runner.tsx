import { createSignal, onCleanup, onMount, Show } from "solid-js"
import {
  BASIC_RUNNER_STORAGE_KEY,
  type BasicRunnerPayload,
  decodeRunnerPayload,
} from "../basic/runner-payload"
import { BasicRunnerCanvas } from "../components/BasicRunnerCanvas"

export const Runner = () => {
  const [getPayload, setPayload] = createSignal<BasicRunnerPayload | null>(null)
  const [getRunVersion, setRunVersion] = createSignal(0)

  onMount(async () => {
    const syncPayload = (raw: string | null) => {
      const payload = decodeRunnerPayload(raw)
      setPayload(payload)
      if (payload) {
        setRunVersion((version) => version + 1)
      }
    }

    syncPayload(localStorage.getItem(BASIC_RUNNER_STORAGE_KEY))

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== BASIC_RUNNER_STORAGE_KEY) return
      syncPayload(event.newValue)
    }

    window.addEventListener("storage", handleStorage)

    onCleanup(() => {
      window.removeEventListener("storage", handleStorage)
    })
  })

  return (
    <Show
      when={getPayload()}
      fallback={
        <div class="h-screen w-screen bg-black overflow-hidden flex items-center justify-center relative"></div>
      }
    >
      <BasicRunnerCanvas
        source={getPayload()!.source}
        snippetName={getPayload()!.snippetName}
        runVersion={getRunVersion()}
        setDocumentTitle
        class="h-screen w-screen bg-black overflow-hidden flex items-center justify-center relative"
      />
    </Show>
  )
}

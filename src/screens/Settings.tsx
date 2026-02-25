import { Link, useSearchParams } from "@solidjs/router"
import { createMemo, createSignal, Show } from "solid-js"

export const Settings = () => {
  const [searchParams] = useSearchParams<{ folder?: string }>()
  const [getStorageLocation, setStorageLocation] = createSignal<"local" | "folder">(
    "local"
  )
  const [getEditorFontSize, setEditorFontSize] = createSignal("14")
  const [getDefaultEditor, setDefaultEditor] = createSignal<"code" | "build">(
    "code"
  )
  const [getRunnerMode, setRunnerMode] = createSignal<"same" | "separate">(
    "same"
  )

  const scriptsHref = createMemo(() => {
    if (!searchParams.folder) {
      return "/scripts"
    }

    return `/scripts?${new URLSearchParams({ folder: searchParams.folder }).toString()}`
  })

  return (
    <div class="h-screen overflow-y-auto custom-scrollbar scrollbar-group">
      <div class="h-main flex justify-center px-3 py-3">
        <div class="w-[min(92vw,720px)] border rounded-lg shadow bg-white dark:bg-zinc-700">
          <div
            data-tauri-drag-region
            class="h-mainHeader border-b px-3 flex items-center justify-between"
          >
            <h1 class="text-sm font-medium">Settings</h1>
            <Link
              href={scriptsHref()}
              class="h-7 px-2 border rounded-lg inline-flex items-center text-xs hover:bg-zinc-100 dark:hover:bg-zinc-600"
            >
              Back to Scripts
            </Link>
          </div>

          <div class="p-3 space-y-3 text-sm">
            <section class="space-y-2">
              <h2 class="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-300">
                Script Storage
              </h2>
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="storage-location"
                  checked={getStorageLocation() === "local"}
                  onChange={() => setStorageLocation("local")}
                />
                <span>Save scripts locally</span>
              </label>
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="storage-location"
                  checked={getStorageLocation() === "folder"}
                  onChange={() => setStorageLocation("folder")}
                />
                <span>Pick a folder</span>
              </label>
              <Show when={getStorageLocation() === "folder"}>
                <div class="pt-1">
                  <button
                    type="button"
                    class="h-7 px-2 border rounded-lg inline-flex items-center text-xs opacity-50 cursor-not-allowed"
                  >
                    Choose Folder (coming soon)
                  </button>
                </div>
              </Show>
            </section>

            <section class="space-y-2">
              <h2 class="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-300">
                Editor Font Size
              </h2>
              <div class="flex items-center gap-2">
                <input
                  type="number"
                  min="10"
                  max="32"
                  step="1"
                  class="h-7 w-24 px-2 border rounded-lg bg-transparent"
                  value={getEditorFontSize()}
                  onInput={(event) => setEditorFontSize(event.currentTarget.value)}
                />
                <span class="text-xs text-zinc-500 dark:text-zinc-300">px</span>
              </div>
            </section>

            <section class="space-y-2">
              <h2 class="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-300">
                Default Editor
              </h2>
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="default-editor"
                  checked={getDefaultEditor() === "code"}
                  onChange={() => setDefaultEditor("code")}
                />
                <span>Code editor</span>
              </label>
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="default-editor"
                  checked={getDefaultEditor() === "build"}
                  onChange={() => setDefaultEditor("build")}
                />
                <span>Build editor</span>
              </label>
            </section>

            <section class="space-y-2">
              <h2 class="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-300">
                Game Preview
              </h2>
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="runner-mode"
                  checked={getRunnerMode() === "same"}
                  onChange={() => setRunnerMode("same")}
                />
                <span>Open in the same window</span>
              </label>
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="runner-mode"
                  checked={getRunnerMode() === "separate"}
                  onChange={() => setRunnerMode("separate")}
                />
                <span>Open in a separate window</span>
              </label>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

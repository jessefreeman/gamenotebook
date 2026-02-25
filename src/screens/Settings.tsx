import { Link } from "@solidjs/router"
import { dialog } from "@tauri-apps/api"
import { createSignal, Show } from "solid-js"
import { actions, state, type DefaultEditor } from "../store"

export const Settings = () => {
  const [getEditorFontSize, setEditorFontSize] = createSignal("14")
  const [getRunnerMode, setRunnerMode] = createSignal<"same" | "separate">(
    "same"
  )

  const setStorageMode = async (mode: "local" | "folder") => {
    await actions.setStorageMode(mode)
  }

  const chooseFolder = async () => {
    const folder = await dialog.open({
      directory: true,
      multiple: false,
    })
    if (typeof folder !== "string") return
    await actions.loadFolder(folder)
  }

  const setDefaultEditor = async (mode: DefaultEditor) => {
    await actions.setDefaultEditor(mode)
  }

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
              href="/scripts"
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
                  checked={state.app.storageMode === "local"}
                  onChange={() => void setStorageMode("local")}
                />
                <span>Inside the app (default)</span>
              </label>
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="storage-location"
                  checked={state.app.storageMode === "folder"}
                  onChange={() => void setStorageMode("folder")}
                />
                <span>Use a folder on this machine</span>
              </label>
              <Show when={state.app.storageMode === "folder"}>
                <div class="pt-1">
                  <button
                    type="button"
                    class="h-7 px-2 border rounded-lg inline-flex items-center text-xs hover:bg-zinc-100 dark:hover:bg-zinc-600"
                    onClick={() => void chooseFolder()}
                  >
                    Choose Folder
                  </button>
                  <p class="pt-2 text-xs text-zinc-500 dark:text-zinc-300 break-all">
                    {state.app.storageFolder || "No folder selected yet."}
                  </p>
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
                  checked={state.app.defaultEditor === "code"}
                  onChange={() => void setDefaultEditor("code")}
                />
                <span>Code editor</span>
              </label>
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="default-editor"
                  checked={state.app.defaultEditor === "build"}
                  onChange={() => void setDefaultEditor("build")}
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

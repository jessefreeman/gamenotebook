import { dialog } from "@tauri-apps/api"
import { createSignal, For, Show } from "solid-js"
import { actions, state, type DefaultEditor } from "../store"
import {
  PLAYER_PALETTE_MODES,
  type PlayerPaletteMode,
  type ThemeMode,
  UI_PALETTE_MODES,
  type UiPaletteMode,
} from "../lib/theme"

export const SettingsPanel = () => {
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

  const setConfirmTrashMoves = async (enabled: boolean) => {
    await actions.setConfirmTrashMoves(enabled)
  }

  const setThemeMode = async (mode: ThemeMode) => {
    await actions.setThemeMode(mode)
  }

  const setUiPaletteMode = async (mode: UiPaletteMode) => {
    await actions.setUiPaletteMode(mode)
  }

  const setPlayerPaletteMode = async (mode: PlayerPaletteMode) => {
    await actions.setPlayerPaletteMode(mode)
  }

  return (
    <div class="h-full w-full overflow-y-auto custom-scrollbar scrollbar-group">
      <div class="mx-auto w-full max-w-3xl p-4 text-sm">
        <section class="space-y-3 px-2 py-4">
          <h2 class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-300">
            Script Storage
          </h2>
          <div class="space-y-2">
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
          </div>
          <Show when={state.app.storageMode === "folder"}>
            <div class="space-y-2 rounded-lg border border-dashed p-3">
              <button
                type="button"
                class="h-7 rounded-lg border px-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-600"
                onClick={() => void chooseFolder()}
              >
                Choose Folder
              </button>
              <p class="text-xs text-zinc-500 dark:text-zinc-300 break-all">
                {state.app.storageFolder || "No folder selected yet."}
              </p>
            </div>
          </Show>
        </section>
        <div class="px-2">
          <div class="border-t border-zinc-200 dark:border-zinc-700"></div>
        </div>
        <section class="space-y-3 px-2 py-4">
          <h2 class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-300">
            Editor
          </h2>
          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <span class="w-40 shrink-0 text-xs text-zinc-500 dark:text-zinc-300">
                Font Size
              </span>
              <input
                type="number"
                min="10"
                max="32"
                step="1"
                class="h-8 w-24 rounded-lg border bg-transparent px-2"
                value={getEditorFontSize()}
                onInput={(event) => setEditorFontSize(event.currentTarget.value)}
              />
              <span class="text-xs text-zinc-500 dark:text-zinc-300">px</span>
            </div>
            <div class="space-y-2 pt-1">
              <div class="text-xs text-zinc-500 dark:text-zinc-300">Default Editor</div>
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
            </div>
          </div>
        </section>
        <div class="px-2">
          <div class="border-t border-zinc-200 dark:border-zinc-700"></div>
        </div>
        <section class="space-y-3 px-2 py-4">
          <h2 class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-300">
            Safety
          </h2>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={state.app.confirmTrashMoves}
              onChange={(event) =>
                void setConfirmTrashMoves(event.currentTarget.checked)
              }
            />
            <span>Ask before moving scripts to Trash</span>
          </label>
        </section>
        <div class="px-2">
          <div class="border-t border-zinc-200 dark:border-zinc-700"></div>
        </div>
        <section class="space-y-3 px-2 py-4">
          <h2 class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-300">
            Colors
          </h2>
          <div class="space-y-2">
            <label class="flex items-center justify-between gap-3">
              <span>App Theme</span>
              <select
                class="h-8 min-w-[11rem] rounded-lg border bg-transparent px-2 text-xs"
                value={state.app.themeMode}
                onChange={(event) =>
                  void setThemeMode(event.currentTarget.value as ThemeMode)
                }
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label class="flex items-center justify-between gap-3">
              <span>UI Palette</span>
              <select
                class="h-8 min-w-[11rem] rounded-lg border bg-transparent px-2 text-xs"
                value={state.app.uiPaletteMode}
                onChange={(event) =>
                  void setUiPaletteMode(event.currentTarget.value as UiPaletteMode)
                }
              >
                <For each={UI_PALETTE_MODES}>
                  {(mode) => <option value={mode}>{mode}</option>}
                </For>
              </select>
            </label>
            <label class="flex items-center justify-between gap-3">
              <span>Player Palette</span>
              <select
                class="h-8 min-w-[11rem] rounded-lg border bg-transparent px-2 text-xs"
                value={state.app.playerPaletteMode}
                onChange={(event) =>
                  void setPlayerPaletteMode(
                    event.currentTarget.value as PlayerPaletteMode
                  )
                }
              >
                <For each={PLAYER_PALETTE_MODES}>
                  {(mode) => <option value={mode}>{mode}</option>}
                </For>
              </select>
            </label>
          </div>
          <p class="text-xs text-zinc-500 dark:text-zinc-300">
            Debug controls let you compare editor and player palette behavior.
          </p>
        </section>
        <div class="px-2">
          <div class="border-t border-zinc-200 dark:border-zinc-700"></div>
        </div>
        <section class="space-y-3 px-2 py-4">
          <h2 class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-300">
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
  )
}

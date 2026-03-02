import { Show } from "solid-js"
import { SettingsPanel } from "../components/SettingsPanel"
import { state } from "../store"

export const Settings = () => {
  return (
    <div class="h-screen">
      <div class="h-main flex flex-col">
        <Show when={state.isMac}>
          <div class="h-6 shrink-0" data-tauri-drag-region></div>
        </Show>
        <div
          data-tauri-drag-region
          class="border-b h-mainHeader shrink-0 flex items-center px-3"
        >
          <h1 class="text-sm font-medium">Settings</h1>
        </div>
        <div class="flex-1 min-h-0">
          <SettingsPanel />
        </div>
      </div>
    </div>
  )
}

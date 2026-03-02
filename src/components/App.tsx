import { Route, Routes } from "@solidjs/router"
import { invoke } from "@tauri-apps/api"
import { appWindow } from "@tauri-apps/api/window"
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js"
import { Home } from "../screens/Home"
import { Runner } from "../screens/Runner"
import { Settings } from "../screens/Settings"
import { Snippets } from "../screens/Snippets"
import { actions, state } from "../store"

export const App = () => {
  const isRunnerWindow = appWindow.label === "basic-runner"
  const [getSystemDarkMode, setSystemDarkMode] = createSignal(false)

  onMount(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)")
    const syncDarkMode = (event: MediaQueryListEvent | MediaQueryList) => {
      setSystemDarkMode(event.matches)
    }
    syncDarkMode(mql)
    mql.addEventListener("change", syncDarkMode)

    if (!isRunnerWindow) {
      invoke("show_main_window")
    }

    void actions.init()

    onCleanup(() => {
      mql.removeEventListener("change", syncDarkMode)
    })
  })

  createEffect(() => {
    const themeMode = state.app.themeMode
    const shouldUseDarkMode =
      themeMode === "dark" || (themeMode === "system" && getSystemDarkMode())
    document.documentElement.classList.toggle("dark", shouldUseDarkMode)
    document.documentElement.dataset.themeMode = themeMode
  })

  createEffect(() => {
    document.documentElement.dataset.uiPalette = state.app.uiPaletteMode
  })

  createEffect(() => {
    document.documentElement.dataset.playerPalette = state.app.playerPaletteMode
  })

  return (
    <Show when={state.ready}>
      <Show
        when={isRunnerWindow}
        fallback={
          <Routes>
            <Route path="/" component={Home} />
            <Route path="/scripts" component={Snippets} />
            <Route path="/settings" component={Settings} />
          </Routes>
        }
      >
        <Runner />
      </Show>
    </Show>
  )
}

import { Route, Routes } from "@solidjs/router"
import { invoke } from "@tauri-apps/api"
import { appWindow } from "@tauri-apps/api/window"
import { onMount, Show } from "solid-js"
import { Home } from "../screens/Home"
import { Runner } from "../screens/Runner"
import { Settings } from "../screens/Settings"
import { Snippets } from "../screens/Snippets"
import { actions, state } from "../store"

export const App = () => {
  const isRunnerWindow = appWindow.label === "basic-runner"

  onMount(() => {
    if (!isRunnerWindow) {
      invoke("show_main_window")
    }

    actions.init()
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

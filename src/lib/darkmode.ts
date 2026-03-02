import { createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { state } from "../store"

export const useDarkMode = () => {
  const [getSystemDarkMode, setSystemDarkMode] = createSignal(false)

  const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
    setSystemDarkMode(e.matches)
  }

  onMount(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)")
    onChange(mql)
    mql.addEventListener("change", onChange)

    onCleanup(() => {
      mql.removeEventListener("change", onChange)
    })
  })

  return createMemo(() => {
    if (state.app.themeMode === "dark") return true
    if (state.app.themeMode === "light") return false
    return getSystemDarkMode()
  })
}

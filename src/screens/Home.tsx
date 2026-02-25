import { useNavigate } from "@solidjs/router"
import { onMount } from "solid-js"

export const Home = () => {
  const goto = useNavigate()

  onMount(() => {
    goto("/scripts", { replace: true })
  })

  return (
    <div
      data-tauri-drag-region
      class="h-screen flex items-center justify-center text-sm text-zinc-500"
    >
      Loading scripts...
    </div>
  )
}

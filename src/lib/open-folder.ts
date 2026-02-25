import { dialog } from "@tauri-apps/api"
import { useNavigate } from "@solidjs/router"
import { actions } from "../store"

export const useOpenFolderDialog = () => {
  const goto = useNavigate()

  const openFolder = async () => {
    const folder = await dialog.open({
      directory: true,
      multiple: false,
    })

    if (typeof folder === "string") {
      await actions.loadFolder(folder)
      goto("/scripts")
    }
  }

  return openFolder
}

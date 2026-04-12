import { getVersion } from "@tauri-apps/api/app"
import { invoke } from "@tauri-apps/api/tauri"
import { relaunch } from "@tauri-apps/api/process"

export type UpdateChannel = "stable" | "dev"

const hasTauriIpc = () => {
  if (typeof window === "undefined") return false
  return Boolean((window as unknown as Record<string, unknown>).__TAURI_IPC__)
}

export const isShellUpdaterSupported = () => {
  return hasTauriIpc()
}

export interface ShellUpdateManifest {
  version: string
  date?: string
  body?: string
  manualDownloadUrl: string
}

export interface ShellUpdateCheckResult {
  shouldUpdate: boolean
  currentVersion: string
  manifest?: ShellUpdateManifest
}

export const getCurrentShellVersion = async (): Promise<string | null> => {
  if (!hasTauriIpc()) return null
  return getVersion()
}

export const checkForShellUpdate = async (
  channel: UpdateChannel
): Promise<ShellUpdateCheckResult> => {
  if (!hasTauriIpc()) {
    return {
      shouldUpdate: false,
      currentVersion: "0.0.0",
    }
  }

  return invoke<ShellUpdateCheckResult>("check_update_for_channel", {
    channel,
  })
}

export const installShellUpdate = async (channel: UpdateChannel): Promise<void> => {
  if (!hasTauriIpc()) return
  await invoke("install_update_for_channel", { channel })
}

export const relaunchShellApp = async (): Promise<void> => {
  if (!hasTauriIpc()) return
  await relaunch()
}

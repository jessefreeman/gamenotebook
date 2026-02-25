import { nanoid } from "nanoid"
import { dialog, fs, path } from "@tauri-apps/api"
import { BaseDirectory } from "@tauri-apps/api/fs"
import { createStore } from "solid-js/store"

export interface Snippet {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  language?: string
  deletedAt?: string
}

export type StorageMode = "local" | "folder"
export type DefaultEditor = "code" | "build"

interface AppData {
  folders: string[]
  storageMode: StorageMode
  storageFolder: string | null
  defaultEditor: DefaultEditor
}

interface SnippetIndexData {
  folders: Record<string, Snippet[]>
}

const SNIPPET_INDEX_FILENAME = "snippet-index.json"
const LOCAL_STORAGE_INDEX_KEY = "__local__"
const LOCAL_SNIPPETS_DIR = "snippets"

interface StorageTarget {
  mode: StorageMode
  indexKey: string
  folder?: string
}

const [state, setState] = createStore<{
  ready: boolean
  app: AppData
  snippets: Snippet[]
  isMac: boolean
}>({
  ready: false,
  app: {
    folders: [],
    storageMode: "local",
    storageFolder: null,
    defaultEditor: "code",
  },
  snippets: [],
  isMac: /macintosh/i.test(navigator.userAgent),
})

export { state }

let snippetIndexCache: SnippetIndexData | null = null

const writeAppJson = async (appData: AppData) => {
  await fs.createDir("", { dir: BaseDirectory.App, recursive: true })
  await fs.writeTextFile("app.json", JSON.stringify(appData), {
    dir: BaseDirectory.App,
  })
}

const getAppDataSnapshot = (): AppData => {
  return {
    folders: [...state.app.folders],
    storageMode: state.app.storageMode,
    storageFolder: state.app.storageFolder,
    defaultEditor: state.app.defaultEditor,
  }
}

const persistAppJson = async () => {
  await writeAppJson(getAppDataSnapshot())
}

const pathExists = async (targetPath: string, baseDir?: BaseDirectory) => {
  const exists: boolean = await fs.exists(targetPath, { dir: baseDir })
  return exists
}

const parseJson = <T>(text: string, fallback: T): T => {
  try {
    return JSON.parse(text) as T
  } catch (error) {
    console.error(error)
    return fallback
  }
}

const getActiveStorageTarget = (): StorageTarget | null => {
  if (state.app.storageMode === "local") {
    return { mode: "local", indexKey: LOCAL_STORAGE_INDEX_KEY }
  }

  if (!state.app.storageFolder) {
    return null
  }

  return {
    mode: "folder",
    indexKey: state.app.storageFolder,
    folder: state.app.storageFolder,
  }
}

const ensureLocalSnippetsDir = async () => {
  await fs.createDir(LOCAL_SNIPPETS_DIR, {
    dir: BaseDirectory.App,
    recursive: true,
  })
}

const formatSnippetNameFromId = (id: string) => {
  const value = id.replace(/[_-]+/g, " ").trim()
  if (!value) return "Untitled"
  return value.replace(/\b\w/g, (char) => char.toUpperCase())
}

const createDefaultSnippet = (id: string): Snippet => {
  const now = new Date().toISOString()
  return {
    id,
    name: formatSnippetNameFromId(id),
    createdAt: now,
    updatedAt: now,
    language: "basic",
  }
}

const normalizeSnippet = (value: unknown): Snippet | null => {
  if (!value || typeof value !== "object") return null

  const source = value as Partial<Snippet>
  if (typeof source.id !== "string" || !source.id.trim()) {
    return null
  }

  const fallback = createDefaultSnippet(source.id)
  return {
    id: source.id,
    name:
      typeof source.name === "string" && source.name.trim()
        ? source.name
        : fallback.name,
    createdAt:
      typeof source.createdAt === "string"
        ? source.createdAt
        : fallback.createdAt,
    updatedAt:
      typeof source.updatedAt === "string"
        ? source.updatedAt
        : fallback.updatedAt,
    language:
      typeof source.language === "string" ? source.language : fallback.language,
    deletedAt: typeof source.deletedAt === "string" ? source.deletedAt : undefined,
  }
}

const normalizeSnippets = (value: unknown): Snippet[] => {
  if (!Array.isArray(value)) return []

  return value.reduce<Snippet[]>((all, item) => {
    const snippet = normalizeSnippet(item)
    if (snippet) all.push(snippet)
    return all
  }, [])
}

const loadSnippetIndex = async (): Promise<SnippetIndexData> => {
  if (snippetIndexCache) return snippetIndexCache

  const text = await fs
    .readTextFile(SNIPPET_INDEX_FILENAME, { dir: BaseDirectory.App })
    .catch(() => "{}")

  const parsed = parseJson<unknown>(text, {})

  const folders: Record<string, Snippet[]> = {}
  const sourceFolders =
    parsed && typeof parsed === "object"
      ? (parsed as { folders?: Record<string, unknown> }).folders
      : undefined

  if (sourceFolders && typeof sourceFolders === "object") {
    for (const [folder, snippets] of Object.entries(sourceFolders)) {
      folders[folder] = normalizeSnippets(snippets)
    }
  }

  snippetIndexCache = { folders }
  return snippetIndexCache
}

const writeSnippetIndex = async (index: SnippetIndexData) => {
  await fs.createDir("", { dir: BaseDirectory.App, recursive: true })
  await fs.writeTextFile(SNIPPET_INDEX_FILENAME, JSON.stringify(index), {
    dir: BaseDirectory.App,
  })
}

const getStoredSnippetsForStorage = async (
  folder: string
): Promise<Snippet[]> => {
  const index = await loadSnippetIndex()
  return normalizeSnippets(index.folders[folder])
}

const setStoredSnippetsForStorage = async (
  folder: string,
  snippets: Snippet[]
) => {
  const index = await loadSnippetIndex()
  index.folders[folder] = snippets
  await writeSnippetIndex(index)
}

const listSnippetFileIds = async (target: StorageTarget): Promise<string[]> => {
  const entries = await (async () => {
    if (target.mode === "local") {
      await ensureLocalSnippetsDir()
      return fs.readDir(LOCAL_SNIPPETS_DIR, { dir: BaseDirectory.App })
    }
    return fs.readDir(target.folder!)
  })().catch((error) => {
    console.error(error)
    return []
  })

  const ids = entries
    .filter((entry) => entry.children === undefined)
    .map((entry) => entry.name || "")
    .filter((name) => name && !name.startsWith("."))

  return [...new Set(ids)].sort((a, b) => a.localeCompare(b))
}

const readSnippetFile = async (target: StorageTarget, id: string) => {
  if (target.mode === "local") {
    return fs.readTextFile(`${LOCAL_SNIPPETS_DIR}/${id}`, {
      dir: BaseDirectory.App,
    })
  }

  return fs.readTextFile(await path.join(target.folder!, id))
}

const writeSnippetFile = async (target: StorageTarget, id: string, content: string) => {
  if (target.mode === "local") {
    await ensureLocalSnippetsDir()
    await fs.writeTextFile(`${LOCAL_SNIPPETS_DIR}/${id}`, content, {
      dir: BaseDirectory.App,
    })
    return
  }

  await fs.writeTextFile(await path.join(target.folder!, id), content)
}

const deleteSnippetFile = async (target: StorageTarget, id: string) => {
  if (target.mode === "local") {
    await fs.removeFile(`${LOCAL_SNIPPETS_DIR}/${id}`, { dir: BaseDirectory.App })
    return
  }

  await fs.removeFile(await path.join(target.folder!, id))
}

const reconcileSnippetsWithFiles = (snippets: Snippet[], fileIds: string[]) => {
  const snippetsById = new Map(snippets.map((snippet) => [snippet.id, snippet]))

  return fileIds.map((id) => {
    const existing = snippetsById.get(id)
    return existing || createDefaultSnippet(id)
  })
}

const loadSnippetsForTarget = async (target: StorageTarget): Promise<Snippet[]> => {
  const storedSnippets = await getStoredSnippetsForStorage(target.indexKey)
  const fileIds = await listSnippetFileIds(target)
  const reconciledSnippets = reconcileSnippetsWithFiles(storedSnippets, fileIds)

  if (JSON.stringify(storedSnippets) !== JSON.stringify(reconciledSnippets)) {
    await setStoredSnippetsForStorage(target.indexKey, reconciledSnippets)
  }

  return reconciledSnippets
}

const persistSnippets = async (target: StorageTarget, snippets: Snippet[]) => {
  await setStoredSnippetsForStorage(target.indexKey, snippets)
}

const isSameStringArray = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

const withFolderFirst = (folder: string) => {
  if (state.app.folders.includes(folder)) {
    return [folder, ...state.app.folders.filter((item) => item !== folder)]
  }
  return [folder, ...state.app.folders.slice(0, 10)]
}

export const actions = {
  init: async () => {
    const text = await fs
      .readTextFile("app.json", { dir: BaseDirectory.App })
      .catch((error) => {
        console.error(error)
        return "{}"
      })
    const appData = parseJson<Partial<AppData>>(text, {})

    const folders = Array.isArray(appData.folders)
      ? appData.folders.filter((folder) => typeof folder === "string")
      : []
    let storageMode: StorageMode =
      appData.storageMode === "folder" ? "folder" : "local"
    let storageFolder =
      typeof appData.storageFolder === "string" ? appData.storageFolder : null
    const defaultEditor: DefaultEditor =
      appData.defaultEditor === "build" ? "build" : "code"

    setState("app", "folders", folders)
    setState("app", "storageMode", storageMode)
    setState("app", "storageFolder", storageFolder)
    setState("app", "defaultEditor", defaultEditor)

    let shouldPersist = appData.storageMode !== "local" && appData.storageMode !== "folder"
    if (appData.defaultEditor !== "code" && appData.defaultEditor !== "build") {
      shouldPersist = true
    }

    if (storageMode === "folder") {
      if (!storageFolder) {
        storageMode = "local"
        setState("app", "storageMode", "local")
        shouldPersist = true
      } else if (!(await pathExists(storageFolder))) {
        storageMode = "local"
        storageFolder = null
        setState("app", "storageMode", "local")
        setState("app", "storageFolder", null)
        setState(
          "app",
          "folders",
          state.app.folders.filter((folder) => folder !== appData.storageFolder)
        )
        shouldPersist = true
      }
    }

    if (shouldPersist) {
      await persistAppJson()
    }

    await actions.loadActiveStorage()
    setState("ready", true)
  },

  removeFolderFromHistory: async (folder: string) => {
    const nextFolders = state.app.folders.filter((f) => f !== folder)
    if (isSameStringArray(nextFolders, state.app.folders)) return

    setState("app", "folders", nextFolders)
    await persistAppJson()
  },

  setStorageMode: async (mode: StorageMode) => {
    if (state.app.storageMode === mode) return

    setState("app", "storageMode", mode)
    await persistAppJson()
    await actions.loadActiveStorage()
  },

  setDefaultEditor: async (mode: DefaultEditor) => {
    if (state.app.defaultEditor === mode) return

    setState("app", "defaultEditor", mode)
    await persistAppJson()
  },

  loadActiveStorage: async () => {
    const target = getActiveStorageTarget()
    if (!target) {
      if (state.snippets.length > 0) {
        setState("snippets", [])
      }
      return
    }

    if (target.mode === "folder" && !(await pathExists(target.folder!))) {
      await actions.removeFolderFromHistory(target.folder!)
      setState("app", "storageMode", "local")
      setState("app", "storageFolder", null)
      setState("snippets", [])
      await persistAppJson()
      await dialog.message("Folder doesn't exist. Storage switched back to local.")
      return
    }

    const snippets = await loadSnippetsForTarget(target)
    if (JSON.stringify(state.snippets) !== JSON.stringify(snippets)) {
      setState("snippets", snippets)
    }

    if (target.mode === "folder") {
      const nextFolders = withFolderFirst(target.folder!)
      if (!isSameStringArray(nextFolders, state.app.folders)) {
        setState("app", "folders", nextFolders)
        await persistAppJson()
      }
    }
  },

  loadFolder: async (folder: string) => {
    const exists = await pathExists(folder)

    if (!exists) {
      await actions.removeFolderFromHistory(folder)
      await dialog.message("Folder doesn't exist")
      return
    }

    setState("app", "storageMode", "folder")
    setState("app", "storageFolder", folder)

    const target: StorageTarget = {
      mode: "folder",
      indexKey: folder,
      folder,
    }
    const snippets = await loadSnippetsForTarget(target)
    if (JSON.stringify(state.snippets) !== JSON.stringify(snippets)) {
      setState("snippets", snippets)
    }

    const nextFolders = withFolderFirst(folder)
    if (!isSameStringArray(nextFolders, state.app.folders)) {
      setState("app", "folders", nextFolders)
    }

    await persistAppJson()
  },

  createSnippet: async (snippet: Snippet, content: string) => {
    const target = getActiveStorageTarget()
    if (!target) return

    await writeSnippetFile(target, snippet.id, content)
    const snippets = [...state.snippets, snippet]
    setState("snippets", snippets)
    await persistSnippets(target, snippets)
  },

  getRandomId: () => {
    return nanoid(10)
  },

  readSnippetContent: async (id: string) => {
    const target = getActiveStorageTarget()
    if (!target) return ""

    const text = await readSnippetFile(target, id)
    return text
  },

  updateSnippet: async <K extends keyof Snippet, V extends Snippet[K]>(
    id: string,
    key: K,
    value: V
  ) => {
    const target = getActiveStorageTarget()
    if (!target) return

    const snippets = state.snippets.map((snippet) => {
      if (snippet.id === id) {
        return { ...snippet, [key]: value, updatedAt: new Date().toISOString() }
      }
      return snippet
    })

    setState("snippets", snippets)
    await persistSnippets(target, snippets)
  },

  updateSnippetContent: async (id: string, content: string) => {
    const target = getActiveStorageTarget()
    if (!target) return

    await writeSnippetFile(target, id, content)
    await actions.updateSnippet(id, "updatedAt", new Date().toISOString())
  },

  moveSnippetsToTrash: async (ids: string[], restore = false) => {
    const target = getActiveStorageTarget()
    if (!target) return

    const snippets = state.snippets.map((snippet) => {
      if (ids.includes(snippet.id)) {
        return {
          ...snippet,
          deletedAt: restore ? undefined : new Date().toISOString(),
        }
      }
      return snippet
    })

    setState("snippets", snippets)
    await persistSnippets(target, snippets)
  },

  deleteSnippetForever: async (id: string) => {
    const target = getActiveStorageTarget()
    if (!target) return

    const snippets = state.snippets.filter((snippet) => id !== snippet.id)
    await deleteSnippetFile(target, id)
    setState("snippets", snippets)
    await persistSnippets(target, snippets)
  },

  emptyTrash: async () => {
    const target = getActiveStorageTarget()
    if (!target) return

    const toDelete: string[] = []
    const snippets = state.snippets.filter((snippet) => {
      if (snippet.deletedAt) {
        toDelete.push(snippet.id)
      }
      return !snippet.deletedAt
    })

    await Promise.all(
      toDelete.map(async (id) => {
        return deleteSnippetFile(target, id)
      })
    )

    setState("snippets", snippets)
    await persistSnippets(target, snippets)
  },

  getFolderHistory: async () => {
    return [...state.app.folders]
  },
}

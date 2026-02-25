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

interface AppData {
  folders: string[]
}

interface SnippetIndexData {
  folders: Record<string, Snippet[]>
}

const SNIPPET_INDEX_FILENAME = "snippet-index.json"

const [state, setState] = createStore<{
  ready: boolean
  app: AppData
  folder: string | null
  snippets: Snippet[]
  isMac: boolean
}>({
  ready: false,
  app: {
    folders: [],
  },
  folder: null,
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

const pathExists = async (path: string, baseDir?: BaseDirectory) => {
  const exists: boolean = await fs.exists(path, { dir: baseDir })
  return exists
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

  let parsed: unknown = {}
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    console.error(error)
  }

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

const getStoredSnippetsForFolder = async (folder: string): Promise<Snippet[]> => {
  const index = await loadSnippetIndex()
  return normalizeSnippets(index.folders[folder])
}

const setStoredSnippetsForFolder = async (folder: string, snippets: Snippet[]) => {
  const index = await loadSnippetIndex()
  index.folders[folder] = snippets
  await writeSnippetIndex(index)
}

const listSnippetFileIds = async (folder: string): Promise<string[]> => {
  const entries = await fs.readDir(folder).catch((error) => {
    console.error(error)
    return []
  })

  const ids = entries
    .filter((entry) => entry.children === undefined)
    .map((entry) => entry.name || "")
    .filter((name) => name && !name.startsWith("."))

  return [...new Set(ids)].sort((a, b) => a.localeCompare(b))
}

const reconcileSnippetsWithFiles = (snippets: Snippet[], fileIds: string[]) => {
  const snippetsById = new Map(snippets.map((snippet) => [snippet.id, snippet]))

  return fileIds.map((id) => {
    const existing = snippetsById.get(id)
    return existing || createDefaultSnippet(id)
  })
}

const loadSnippetsForFolder = async (folder: string): Promise<Snippet[]> => {
  const storedSnippets = await getStoredSnippetsForFolder(folder)
  const fileIds = await listSnippetFileIds(folder)
  const reconciledSnippets = reconcileSnippetsWithFiles(storedSnippets, fileIds)

  if (JSON.stringify(storedSnippets) !== JSON.stringify(reconciledSnippets)) {
    await setStoredSnippetsForFolder(folder, reconciledSnippets)
  }

  return reconciledSnippets
}

const persistSnippets = async (folder: string, snippets: Snippet[]) => {
  await setStoredSnippetsForFolder(folder, snippets)
}

export const actions = {
  init: async () => {
    const text = await fs
      .readTextFile("app.json", { dir: BaseDirectory.App })
      .catch((error) => {
        console.error(error)
        return "{}"
      })
    const appData: Partial<AppData> = JSON.parse(text)

    if (appData.folders) {
      setState("app", "folders", appData.folders)
    }
    setState("ready", true)
  },

  setFolder: (folder: string | null) => {
    setState("folder", folder)
  },

  removeFolderFromHistory: async (folder: string) => {
    setState(
      "app",
      "folders",
      state.app.folders.filter((f) => f !== folder)
    )
    await writeAppJson(state.app)
  },

  loadFolder: async (folder: string) => {
    const exists = await pathExists(folder)

    if (!exists) {
      await actions.removeFolderFromHistory(folder)
      await dialog.message("Folder doesn't exist")
      return
    }

    const snippets = await loadSnippetsForFolder(folder)
    if (JSON.stringify(state.snippets) !== JSON.stringify(snippets)) {
      setState("snippets", snippets)
    }

    if (state.app.folders.includes(folder)) {
      setState("app", "folders", [
        folder,
        ...state.app.folders.filter((f) => f !== folder),
      ])
    } else {
      setState("app", "folders", [folder, ...state.app.folders.slice(0, 10)])
    }

    await writeAppJson(state.app)
  },

  createSnippet: async (snippet: Snippet, content: string) => {
    if (!state.folder) return

    const filepath = await path.join(state.folder, snippet.id)
    await fs.writeTextFile(filepath, content)
    const snippets = [...state.snippets, snippet]
    setState("snippets", snippets)
    await persistSnippets(state.folder, snippets)
  },

  getRandomId: () => {
    return nanoid(10)
  },

  readSnippetContent: async (id: string) => {
    if (!state.folder) return ""
    const text = await fs.readTextFile(await path.join(state.folder, id))
    return text
  },

  updateSnippet: async <K extends keyof Snippet, V extends Snippet[K]>(
    id: string,
    key: K,
    value: V
  ) => {
    if (!state.folder) return

    const snippets = state.snippets.map((snippet) => {
      if (snippet.id === id) {
        return { ...snippet, [key]: value, updatedAt: new Date().toISOString() }
      }
      return snippet
    })

    setState("snippets", snippets)
    await persistSnippets(state.folder, snippets)
  },

  updateSnippetContent: async (id: string, content: string) => {
    if (!state.folder) return

    await fs.writeTextFile(await path.join(state.folder, id), content)
    await actions.updateSnippet(id, "updatedAt", new Date().toISOString())
  },

  moveSnippetsToTrash: async (ids: string[], restore = false) => {
    if (!state.folder) return

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
    await persistSnippets(state.folder, snippets)
  },

  deleteSnippetForever: async (id: string) => {
    if (!state.folder) return

    const snippets = state.snippets.filter((snippet) => id !== snippet.id)
    await fs.removeFile(await path.join(state.folder, id))
    setState("snippets", snippets)
    await persistSnippets(state.folder, snippets)
  },

  emptyTrash: async () => {
    if (!state.folder) return
    const toDelete: string[] = []
    const snippets = state.snippets.filter((snippet) => {
      if (snippet.deletedAt) {
        toDelete.push(snippet.id)
      }
      return !snippet.deletedAt
    })
    await Promise.all(
      toDelete.map(async (id) => {
        return fs.removeFile(await path.join(state.folder!, id))
      })
    )
    setState("snippets", snippets)
    await persistSnippets(state.folder, snippets)
  },

  getFolderHistory: async () => {
    const text = await fs
      .readTextFile("folders.json", { dir: BaseDirectory.App })
      .catch(() => "[]")
    const folders: string[] = JSON.parse(text)
    return folders
  },
}

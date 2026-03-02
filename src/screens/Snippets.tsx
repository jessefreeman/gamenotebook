import { Link, useNavigate, useSearchParams } from "@solidjs/router"
import type { EditorView } from "codemirror"
import { snippet as createCodeMirrorSnippet } from "@codemirror/autocomplete"
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  Show,
} from "solid-js"
import { confirm } from "@tauri-apps/api/dialog"
import { Editor } from "../components/Editor"
import {
  BasicBlocklyEditor,
  type BasicBlocklyPendingJump,
  type BasicBlocklyPendingHistoryAction,
  type BasicBlocklyPendingInsert,
} from "../components/BasicBlocklyEditor"
import {
  BasicCommandModal,
  LineJumpModal,
  ShortcutCheatSheetModal,
} from "../components/Modal"
import { languages } from "../lib/languages"
import { debounce } from "../lib/utils"
import { actions, state } from "../store"
import { Button } from "../components/Button"
import { BasicRunnerCanvas } from "../components/BasicRunnerCanvas"
import { analyzeLegacyBasicPasteMigration } from "../basic/blockly-model"
import { SettingsPanel } from "../components/SettingsPanel"

type SnippetMainMode = "play" | "code" | "build"
type SnippetEditorMode = "code" | "build"

export const Snippets = () => {
  const goto = useNavigate()
  const [searchParams] = useSearchParams<{ id?: string; view?: string }>()
  const [content, setContent] = createSignal("")
  const [getOpenBasicCommandModal, setOpenBasicCommandModal] =
    createSignal(false)
  const [getOpenLineJumpModal, setOpenLineJumpModal] = createSignal(false)
  const [getOpenShortcutCheatSheet, setOpenShortcutCheatSheet] =
    createSignal(false)
  const [getSearchType, setSearchType] = createSignal<"non-trash" | "trash">(
    "non-trash"
  )
  const [getSearchKeyword, setSearchKeyword] = createSignal<string>("")
  const [getIsSearchFocused, setIsSearchFocused] = createSignal(false)
  const [getIsContentDirty, setIsContentDirty] = createSignal(false)
  const [getIsSavingContent, setIsSavingContent] = createSignal(false)
  const [getSelectedSnippetIds, setSelectedSnippetIds] = createSignal<string[]>(
    []
  )
  const [getInlineRenameSnippetId, setInlineRenameSnippetId] = createSignal<
    string | null
  >(null)
  const [getInlineRenameValue, setInlineRenameValue] = createSignal("")
  const [getDraggedSnippetId, setDraggedSnippetId] = createSignal<string | null>(
    null
  )
  const [getTrashDropSnippetId, setTrashDropSnippetId] = createSignal<
    string | null
  >(null)
  const [getIsTrashDropTarget, setIsTrashDropTarget] = createSignal(false)
  const [getMainMode, setMainMode] = createSignal<SnippetMainMode>("code")
  const [getLastEditorMode, setLastEditorMode] =
    createSignal<SnippetEditorMode>(state.app.defaultEditor)
  const [getPlayRunVersion, setPlayRunVersion] = createSignal(0)
  const [getPendingBuildInsert, setPendingBuildInsert] =
    createSignal<BasicBlocklyPendingInsert | null>(null)
  const [getPendingBuildJump, setPendingBuildJump] =
    createSignal<BasicBlocklyPendingJump | null>(null)
  const [getPendingBuildHistoryAction, setPendingBuildHistoryAction] =
    createSignal<BasicBlocklyPendingHistoryAction | null>(null)
  const [getIsEditorTyping, setIsEditorTyping] = createSignal(false)
  const [getPinnedActiveSnippetSortDate, setPinnedActiveSnippetSortDate] =
    createSignal<string | null>(null)
  const [getIsCodeEditorFocused, setIsCodeEditorFocused] = createSignal(false)
  const [getLastTrashedSnippetId, setLastTrashedSnippetId] = createSignal<
    string | null
  >(null)

  let editorView: EditorView | undefined
  let searchInputEl: HTMLInputElement | undefined
  let renameInputEl: HTMLInputElement | undefined
  let trashButtonEl: HTMLButtonElement | undefined
  let mainPaneEl: HTMLDivElement | undefined
  let isSavingInlineRename = false
  let latestContentRevision = 0
  let nextBuildInsertId = 0
  let nextBuildJumpId = 0
  let nextBuildHistoryActionId = 0
  let handledTrashDropForCurrentDrag = false
  let suppressTrashButtonClick = false
  let dragPreviewEl: HTMLElement | null = null
  let typingIdleTimeoutId: number | null = null
  let contentLoadRequestId = 0

  const getSnippetSortDateSource = (snippet: (typeof state.snippets)[number]) => {
    return (
      getSearchType() === "trash"
        ? snippet.deletedAt || snippet.updatedAt || snippet.createdAt
        : snippet.updatedAt || snippet.createdAt
    )
  }

  const getSnippetSortDate = (snippet: (typeof state.snippets)[number]) => {
    const pinnedActiveDate = getPinnedActiveSnippetSortDate()
    const isPinnedActiveSnippet =
      getSearchType() !== "trash" &&
      Boolean(searchParams.id) &&
      snippet.id === searchParams.id &&
      getIsEditorTyping() &&
      Boolean(pinnedActiveDate)

    const sourceDate = isPinnedActiveSnippet
      ? pinnedActiveDate!
      : getSnippetSortDateSource(snippet)

    const parsedDate = new Date(sourceDate)
    return Number.isNaN(parsedDate.getTime()) ? new Date(0) : parsedDate
  }

  const snippets = createMemo(() => {
    const keyword = getSearchKeyword().toLowerCase()

    return state.snippets
      .filter((snippet) => {
        const conditions: (string | boolean | undefined | null)[] = []

        conditions.push(
          getSearchType() === "trash" ? snippet.deletedAt : !snippet.deletedAt
        )

        if (keyword) {
          conditions.push(snippet.name.toLowerCase().includes(keyword))
        }

        return conditions.every((v) => v)
      })
      .sort((a, b) => {
        const aTime = getSnippetSortDate(a).getTime()
        const bTime = getSnippetSortDate(b).getTime()
        if (aTime === bTime) {
          return a.name.localeCompare(b.name)
        }
        return bTime - aTime
      })
  })

  const groupedSnippets = createMemo(() => {
    if (getSearchType() === "trash") {
      return [{ id: "trash", label: null, snippets: snippets() }]
    }

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterdayStart = new Date(todayStart)
    yesterdayStart.setDate(todayStart.getDate() - 1)
    const last7DaysStart = new Date(todayStart)
    last7DaysStart.setDate(todayStart.getDate() - 7)

    const groups: {
      id: string
      label: string | null
      snippets: (typeof state.snippets)[number][]
    }[] = []

    const ensureGroup = (id: string, label: string | null) => {
      let existingGroup = groups.find((group) => group.id === id)
      if (!existingGroup) {
        existingGroup = { id, label, snippets: [] }
        groups.push(existingGroup)
      }
      return existingGroup
    }

    for (const snippet of snippets()) {
      const snippetDate = getSnippetSortDate(snippet)
      const snippetDayStart = new Date(
        snippetDate.getFullYear(),
        snippetDate.getMonth(),
        snippetDate.getDate()
      )

      if (snippetDayStart.getTime() >= todayStart.getTime()) {
        ensureGroup("today", "Today").snippets.push(snippet)
        continue
      }

      if (snippetDayStart.getTime() >= yesterdayStart.getTime()) {
        ensureGroup("yesterday", "Yesterday").snippets.push(snippet)
        continue
      }

      if (snippetDayStart.getTime() >= last7DaysStart.getTime()) {
        ensureGroup("last-7-days", "Last 7 Days").snippets.push(snippet)
        continue
      }

      if (snippetDate.getFullYear() === now.getFullYear()) {
        const monthLabel = snippetDate.toLocaleString(undefined, {
          month: "short",
        })
        ensureGroup(`month-${snippetDate.getMonth()}`, monthLabel).snippets.push(
          snippet
        )
        continue
      }

      const yearLabel = `${snippetDate.getFullYear()}`
      ensureGroup(`year-${yearLabel}`, yearLabel).snippets.push(snippet)
    }

    return groups
  })

  const actualSelectedSnippetIds = createMemo(() => {
    if (getSearchType() === "trash") {
      return []
    }
    const ids = [...getSelectedSnippetIds()]
    if (searchParams.id && snippets().some((s) => s.id === searchParams.id)) {
      ids.push(searchParams.id)
    }
    return ids
  })

  const snippet = createMemo(() =>
    state.snippets.find((snippet) => snippet.id === searchParams.id)
  )
  const isSettingsView = createMemo(() => searchParams.view === "settings")

  const canDropDraggedSnippetToTrash = createMemo(() => {
    const draggedSnippetId = getDraggedSnippetId()
    if (!draggedSnippetId) return false

    const draggedSnippet = state.snippets.find(
      (snippet) => snippet.id === draggedSnippetId
    )
    return Boolean(draggedSnippet && !draggedSnippet.deletedAt)
  })

  const isSidebarSnippetActive = (id: string) => {
    if (getSearchType() === "trash") {
      return false
    }
    return id === snippet()?.id || getSelectedSnippetIds().includes(id)
  }

  const languageExtension = createMemo(() => {
    const languageId = snippet()?.language || "basic"
    const selected = languages.find((lang) => lang.id === languageId)
    if (selected?.extension) return selected.extension

    // If a snippet is still stored as plaintext, keep BASIC highlighting active.
    if (languageId === "plaintext") {
      return languages.find((lang) => lang.id === "basic")?.extension
    }

    return undefined
  })

  const editorExtensions = createMemo(() => {
    const extensionFactory = languageExtension()
    return extensionFactory ? [extensionFactory()] : []
  })

  const isBasicSnippet = createMemo(() => {
    const languageId = snippet()?.language || "basic"
    return languageId === "basic" || languageId === "plaintext"
  })

  const runShortcutLabel = createMemo(() =>
    state.isMac ? "⌘ + Enter" : "Ctrl + Enter"
  )
  const hasActiveStorage = createMemo(
    () =>
      state.app.storageMode === "local" ||
      Boolean(state.app.storageMode === "folder" && state.app.storageFolder)
  )

  const isPlayMode = createMemo(() => getMainMode() === "play")
  const isBuildMode = createMemo(() => getMainMode() === "build")

  const setEditorMode = (mode: SnippetEditorMode) => {
    setLastEditorMode(mode)
    setMainMode(mode)
  }

  const runInPlayMode = () => {
    if (!isBasicSnippet()) return
    if (getMainMode() !== "play") {
      setLastEditorMode(isBuildMode() ? "build" : "code")
    }
    setMainMode("play")
    setPlayRunVersion((version) => version + 1)
  }

  const newSnippet = async () => {
    if (!hasActiveStorage()) {
      openSettings()
      return
    }

    const d = new Date()
    const id = actions.getRandomId()
    await actions.createSnippet(
      {
        id,
        name: "Untitled",
        createdAt: d.toISOString(),
        updatedAt: d.toISOString(),
        language: "basic",
      },
      ""
    )
    setSearchType("non-trash")
    setInlineRenameSnippetId(id)
    setInlineRenameValue("Untitled")
    setLastEditorMode(state.app.defaultEditor)
    setMainMode(state.app.defaultEditor)
    goto(`/scripts?${new URLSearchParams({ id }).toString()}`)
  }

  const openSettings = () => {
    if (isSettingsView()) {
      closeSettingsView()
      return
    }

    const params = new URLSearchParams()
    if (searchParams.id) {
      params.set("id", searchParams.id)
    }
    params.set("view", "settings")
    goto(`/scripts?${params.toString()}`)
  }

  const closeSettingsView = () => {
    const params = new URLSearchParams()
    if (searchParams.id) {
      params.set("id", searchParams.id)
    }
    const query = params.toString()
    goto(query ? `/scripts?${query}` : "/scripts")
  }

  const gotoScripts = (options?: { id?: string | null; view?: string | null }) => {
    const params = new URLSearchParams()
    if (options?.id) {
      params.set("id", options.id)
    }
    if (options?.view) {
      params.set("view", options.view)
    }
    const query = params.toString()
    goto(query ? `/scripts?${query}` : "/scripts")
  }

  const startInlineRename = (
    e: MouseEvent & { currentTarget: HTMLElement },
    snippetId: string,
    currentName: string
  ) => {
    e.preventDefault()
    e.stopPropagation()
    setInlineRenameSnippetId(snippetId)
    setInlineRenameValue(currentName)
  }

  const cancelInlineRename = () => {
    setInlineRenameSnippetId(null)
    setInlineRenameValue("")
  }

  const saveInlineRename = async (snippetId: string) => {
    if (isSavingInlineRename) return
    const targetSnippet = state.snippets.find((item) => item.id === snippetId)
    if (!targetSnippet) {
      cancelInlineRename()
      return
    }

    isSavingInlineRename = true
    try {
      const trimmedName = getInlineRenameValue().trim()
      const nextName = trimmedName || targetSnippet.name

      if (nextName !== targetSnippet.name) {
        await actions.updateSnippet(snippetId, "name", nextName)
      }
    } finally {
      isSavingInlineRename = false
      cancelInlineRename()
    }
  }

  const resetTrashDragState = () => {
    if (dragPreviewEl) {
      dragPreviewEl.remove()
      dragPreviewEl = null
    }
    setDraggedSnippetId(null)
    setTrashDropSnippetId(null)
    setIsTrashDropTarget(false)
  }

  onCleanup(() => {
    if (typingIdleTimeoutId !== null) {
      window.clearTimeout(typingIdleTimeoutId)
      typingIdleTimeoutId = null
    }
    if (dragPreviewEl) {
      dragPreviewEl.remove()
      dragPreviewEl = null
    }
  })

  createEffect(() => {
    const draggedSnippetId = getDraggedSnippetId()
    if (!draggedSnippetId) return

    const handleWindowDragOver = (event: DragEvent) => {
      if (!getDraggedSnippetId()) return
      event.preventDefault()
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move"
      }
    }

    const handleWindowDrop = (event: DragEvent) => {
      if (!getDraggedSnippetId()) return
      event.preventDefault()
    }

    window.addEventListener("dragover", handleWindowDragOver)
    window.addEventListener("drop", handleWindowDrop)

    onCleanup(() => {
      window.removeEventListener("dragover", handleWindowDragOver)
      window.removeEventListener("drop", handleWindowDrop)
    })
  })

  const armTrashButtonClickSuppression = () => {
    suppressTrashButtonClick = true
    window.setTimeout(() => {
      suppressTrashButtonClick = false
    }, 0)
  }

  const moveDraggedSnippetToTrash = async (draggedSnippetId: string) => {
    const targetSnippet = state.snippets.find(
      (snippet) => snippet.id === draggedSnippetId
    )
    if (!targetSnippet || targetSnippet.deletedAt) return

    if (state.app.confirmTrashMoves) {
      if (!(await confirm(`Are you sure you want to move this script to Trash?`))) {
        return
      }
    }

    await actions.moveSnippetsToTrash([draggedSnippetId])
    setLastTrashedSnippetId(draggedSnippetId)
    setSelectedSnippetIds((ids) => ids.filter((id) => id !== draggedSnippetId))
    if (searchParams.id === draggedSnippetId) {
      gotoScripts()
    }
  }

  const restoreSnippetFromTrash = async (
    snippetId: string,
    options?: { openAfterRestore?: boolean; withPrompt?: boolean }
  ) => {
    const targetSnippet = state.snippets.find((snippet) => snippet.id === snippetId)
    if (!targetSnippet || !targetSnippet.deletedAt) return false

    if (options?.withPrompt) {
      const confirmed = await confirm(
        `Restore "${targetSnippet.name}" from Trash?`
      )
      if (!confirmed) return false
    }

    await actions.moveSnippetsToTrash([snippetId], true)
    if (getLastTrashedSnippetId() === snippetId) {
      setLastTrashedSnippetId(null)
    }
    setSearchType("non-trash")
    setSelectedSnippetIds([])
    setInlineRenameSnippetId(null)
    setInlineRenameValue("")
    gotoScripts({ id: options?.openAfterRestore === false ? null : snippetId })
    return true
  }

  const getDraggedSnippetIdFromEvent = (e: DragEvent) => {
    const fromCustomData = e.dataTransfer?.getData(
      "application/x-gamenotepad-script-id"
    )
    if (fromCustomData) return fromCustomData

    const fromTextData = e.dataTransfer?.getData("text/plain")
    if (fromTextData && state.snippets.some((snippet) => snippet.id === fromTextData)) {
      return fromTextData
    }

    return getDraggedSnippetId()
  }

  const handleSnippetDragStart = (
    e: DragEvent & { currentTarget: HTMLElement },
    snippetId: string
  ) => {
    if (getInlineRenameSnippetId() === snippetId) {
      e.preventDefault()
      return
    }
    const sourceSnippet = state.snippets.find((snippet) => snippet.id === snippetId)
    if (!sourceSnippet || sourceSnippet.deletedAt) {
      e.preventDefault()
      return
    }

    handledTrashDropForCurrentDrag = false
    suppressTrashButtonClick = false
    setTrashDropSnippetId(null)
    setIsTrashDropTarget(false)
    setDraggedSnippetId(snippetId)
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.dropEffect = "move"
      e.dataTransfer.setData("application/x-gamenotepad-script-id", snippetId)
      e.dataTransfer.setData("text/plain", snippetId)

      if (dragPreviewEl) {
        dragPreviewEl.remove()
      }
      dragPreviewEl = e.currentTarget.cloneNode(true) as HTMLElement
      const computedStyle = window.getComputedStyle(e.currentTarget)
      const isDarkMode = document.documentElement.classList.contains("dark")
      const fallbackBackground = isDarkMode ? "rgb(82 82 91)" : "rgb(228 228 231)"
      const sourceBackground = computedStyle.backgroundColor
      dragPreviewEl.style.position = "fixed"
      dragPreviewEl.style.top = "-9999px"
      dragPreviewEl.style.left = "-9999px"
      dragPreviewEl.style.width = `${e.currentTarget.offsetWidth}px`
      dragPreviewEl.style.pointerEvents = "none"
      dragPreviewEl.style.opacity = "0.92"
      dragPreviewEl.style.backgroundColor =
        sourceBackground && sourceBackground !== "rgba(0, 0, 0, 0)"
          ? sourceBackground
          : fallbackBackground
      dragPreviewEl.style.borderRadius = "0.5rem"
      dragPreviewEl.style.color = computedStyle.color
      dragPreviewEl.style.boxShadow = isDarkMode
        ? "0 8px 20px rgba(0, 0, 0, 0.45)"
        : "0 8px 20px rgba(24, 24, 27, 0.18)"
      document.body.appendChild(dragPreviewEl)
      e.dataTransfer.setDragImage(dragPreviewEl, 14, 14)
    }
  }

  const handleSnippetDragEnd = async (
    e: DragEvent & { currentTarget: HTMLElement }
  ) => {
    try {
      const dropTarget = document.elementFromPoint(e.clientX, e.clientY)
      const releasedOverTrash =
        !!trashButtonEl && !!dropTarget && trashButtonEl.contains(dropTarget)
      const droppedOnTrash =
        !handledTrashDropForCurrentDrag &&
        (getIsTrashDropTarget() || releasedOverTrash)
      const draggedSnippetId = getTrashDropSnippetId() || getDraggedSnippetId()

      if (droppedOnTrash && draggedSnippetId) {
        armTrashButtonClickSuppression()
        await moveDraggedSnippetToTrash(draggedSnippetId)
      }
    } catch (error) {
      console.error("Failed to move dragged script to Trash", error)
    } finally {
      handledTrashDropForCurrentDrag = false
      resetTrashDragState()
    }
  }

  const handleTrashDragOver = (e: DragEvent & { currentTarget: HTMLElement }) => {
    const draggedSnippetId = getDraggedSnippetIdFromEvent(e)
    if (!draggedSnippetId) {
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "none"
      }
      setTrashDropSnippetId(null)
      setIsTrashDropTarget(false)
      return
    }

    const targetSnippet = state.snippets.find(
      (snippet) => snippet.id === draggedSnippetId
    )
    if (!targetSnippet || targetSnippet.deletedAt) {
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "none"
      }
      setTrashDropSnippetId(null)
      setIsTrashDropTarget(false)
      return
    }

    e.preventDefault()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move"
    }
    setTrashDropSnippetId(draggedSnippetId)
    setIsTrashDropTarget(true)
  }

  const handleTrashDragLeave = (
    e: DragEvent & { currentTarget: HTMLElement }
  ) => {
    const nextTarget = e.relatedTarget as Node | null
    if (nextTarget && e.currentTarget.contains(nextTarget)) return
    setTrashDropSnippetId(null)
    setIsTrashDropTarget(false)
  }

  const handleTrashDrop = async (e: DragEvent & { currentTarget: HTMLElement }) => {
    e.preventDefault()
    e.stopPropagation()
    handledTrashDropForCurrentDrag = true
    armTrashButtonClickSuppression()

    try {
      const draggedSnippetId =
        getTrashDropSnippetId() || getDraggedSnippetIdFromEvent(e)
      if (!draggedSnippetId) return

      await moveDraggedSnippetToTrash(draggedSnippetId)
    } catch (error) {
      console.error("Failed to move dropped script to Trash", error)
    } finally {
      resetTrashDragState()
    }
  }

  const handleSnippetDragOver = (e: DragEvent & { currentTarget: HTMLElement }) => {
    if (!canDropDraggedSnippetToTrash()) return
    e.preventDefault()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move"
    }
  }

  const handleSidebarDragOver = (e: DragEvent & { currentTarget: HTMLElement }) => {
    if (!canDropDraggedSnippetToTrash()) return
    e.preventDefault()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move"
    }
  }

  const handleSidebarDrop = (e: DragEvent & { currentTarget: HTMLElement }) => {
    if (!canDropDraggedSnippetToTrash()) return
    e.preventDefault()
  }

  const toggleTrashFilter = async () => {
    if (getSearchType() === "trash") {
      const candidateId = getLastTrashedSnippetId() || snippets()[0]?.id
      if (candidateId) {
        const restored = await restoreSnippetFromTrash(candidateId, {
          openAfterRestore: true,
        })
        if (restored) return
      }
      setSearchType("non-trash")
      setSelectedSnippetIds([])
      gotoScripts()
      return
    }

    setInlineRenameSnippetId(null)
    setInlineRenameValue("")
    setSelectedSnippetIds([])
    gotoScripts()
    setSearchType("trash")
  }

  const handleTrashButtonClick = (
    e: MouseEvent & { currentTarget: HTMLElement }
  ) => {
    if (suppressTrashButtonClick || getDraggedSnippetId()) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    void toggleTrashFilter()
  }

  const persistEditorChange = debounce(async (
    snippetId: string,
    value: string,
    revision: number
  ) => {
    console.log("saving content..")
    setIsSavingContent(true)

    try {
      await actions.updateSnippetContent(snippetId, value)
      if (revision === latestContentRevision) {
        setIsContentDirty(false)
      }
    } finally {
      setIsSavingContent(false)
    }
  }, 250)

  const handleEditorChange = (value: string) => {
    const currentSnippet = snippet()
    if (!currentSnippet) return

    const normalizedValue = isBasicSnippet() ? value.toUpperCase() : value
    if (normalizedValue === content()) return

    if (!getIsEditorTyping()) {
      setPinnedActiveSnippetSortDate(getSnippetSortDateSource(currentSnippet))
    }
    setIsEditorTyping(true)
    if (typingIdleTimeoutId !== null) {
      window.clearTimeout(typingIdleTimeoutId)
    }
    typingIdleTimeoutId = window.setTimeout(() => {
      setIsEditorTyping(false)
      setPinnedActiveSnippetSortDate(null)
      typingIdleTimeoutId = null
    }, 1200)

    setContent(normalizedValue)
    setIsContentDirty(true)
    latestContentRevision += 1
    persistEditorChange(
      currentSnippet.id,
      normalizedValue,
      latestContentRevision
    )
  }

  const transformPastedBasicSource = (pastedText: string): string | null => {
    if (!isBasicSnippet() || isBuildMode()) {
      return null
    }

    const migration = analyzeLegacyBasicPasteMigration(pastedText)
    if (!migration.shouldOfferMigration) {
      return null
    }

    const shouldMigrate = window.confirm(
      "Detected legacy numbered BASIC lines. Convert and remap line references for GameNotepad?"
    )
    return shouldMigrate ? migration.migratedSource : pastedText
  }

  const expandSnippetTemplate = (snippetTemplate: string): string => {
    return snippetTemplate
      .replace(/\$\{(\d+):([^}]*)\}/g, (_full, _index, fallback) => fallback)
      .replace(/\$\{\d+\}/g, "")
      .replace(/\$0/g, "")
  }

  const insertBasicCommandSnippet = (snippetTemplate: string) => {
    if (isBasicSnippet() && isBuildMode()) {
      const statement = expandSnippetTemplate(snippetTemplate).trim()
      if (!statement) return

      nextBuildInsertId += 1
      setPendingBuildInsert({
        id: nextBuildInsertId,
        statement,
      })
      return
    }

    const view = editorView
    if (!view) return

    const selection = view.state.selection.main
    createCodeMirrorSnippet(snippetTemplate)(
      view,
      { label: "basic-command", type: "keyword" },
      selection.from,
      selection.to
    )
    view.focus()
  }

  const openLineJump = () => {
    setOpenLineJumpModal(true)
  }

  const moveSelectedSnippetsToTrashOrRestore = async () => {
    const restore = getSearchType() === "trash"
    const shouldProceed =
      !restore && !state.app.confirmTrashMoves
        ? true
        : await confirm(
        restore
          ? `Are you sure you want to restore selected scripts from Trash`
          : `Are you sure you want to move selected scripts to Trash?`
      )
    if (!shouldProceed) return

    const targetIds = actualSelectedSnippetIds()
    await actions.moveSnippetsToTrash(targetIds, restore)
    if (!restore && targetIds.length > 0) {
      setLastTrashedSnippetId(targetIds[0])
    }
    setSelectedSnippetIds([])
    if (restore && targetIds.length > 0) {
      setSearchType("non-trash")
      gotoScripts({ id: targetIds[0] })
      return
    }
    if (!restore && searchParams.id && targetIds.includes(searchParams.id)) {
      gotoScripts()
    }
  }

  const emptyTrash = async () => {
    if (
      await confirm(
        `Are you sure you want to permanently erase the items in the Trash?`
      )
    ) {
      await actions.emptyTrash()
    }
  }

  const isRunShortcut = (event: KeyboardEvent) => {
    if (event.key !== "Enter") return false
    if (event.repeat) return false
    if (event.shiftKey || event.altKey) return false
    return state.isMac ? event.metaKey : event.ctrlKey
  }

  const shouldIgnoreDesignerShortcut = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null
    if (!target) return false

    const tagName = target.tagName
    if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
      return true
    }

    return target.isContentEditable
  }

  const isUndoShortcut = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() !== "z") return false
    if (event.shiftKey || event.altKey) return false
    return state.isMac ? event.metaKey : event.ctrlKey
  }

  const isRedoShortcut = (event: KeyboardEvent) => {
    if (event.altKey) return false

    const key = event.key.toLowerCase()
    if (state.isMac) {
      return event.metaKey && event.shiftKey && key === "z"
    }

    return (event.ctrlKey && event.shiftKey && key === "z") || (event.ctrlKey && key === "y")
  }

  const isOpenShortcutCheatSheetShortcut = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.repeat) return false
    if (event.metaKey || event.ctrlKey || event.altKey) return false
    return event.key === "F1"
  }

  const queueBuildHistoryAction = (type: "undo" | "redo") => {
    if (!isBasicSnippet() || !isBuildMode()) return
    nextBuildHistoryActionId += 1
    setPendingBuildHistoryAction({
      id: nextBuildHistoryActionId,
      type,
    })
  }

  const jumpToBasicLine = (targetLineNumber: number) => {
    if (!Number.isInteger(targetLineNumber) || targetLineNumber <= 0) {
      return
    }

    if (isBasicSnippet() && isBuildMode()) {
      nextBuildJumpId += 1
      setPendingBuildJump({
        id: nextBuildJumpId,
        lineNumber: targetLineNumber,
      })
      return
    }

    const view = editorView
    if (!view) return

    const lastLine = view.state.doc.line(view.state.doc.lines)
    const anchor =
      targetLineNumber > view.state.doc.lines
        ? lastLine.to
        : view.state.doc.line(targetLineNumber).from

    view.dispatch({
      selection: { anchor },
      scrollIntoView: true,
    })
    view.focus()
  }

  const focusMainPane = () => {
    if (editorView) {
      editorView.focus()
      return
    }

    const visualEditorEl = mainPaneEl?.querySelector(
      ".basic-blockly-editor"
    ) as HTMLElement | null
    if (visualEditorEl) {
      visualEditorEl.tabIndex = -1
      visualEditorEl.focus()
      return
    }

    const fallbackEl = mainPaneEl?.querySelector(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
    ) as HTMLElement | null
    fallbackEl?.focus()
  }

  const collapseSearch = (options?: { clearKeyword?: boolean }) => {
    if (options?.clearKeyword) {
      setSearchKeyword("")
    }
    setIsSearchFocused(false)
    if (searchInputEl && document.activeElement === searchInputEl) {
      searchInputEl.blur()
    }
  }

  const handleNewSnippetMouseDown = (e: MouseEvent) => {
    // Keep button click stable while search is focused (prevents blur/reflow click loss).
    e.preventDefault()
  }

  const handleNewSnippetClick = (e: MouseEvent) => {
    e.preventDefault()
    collapseSearch({ clearKeyword: true })
    void newSnippet()
  }

  createEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (
        isOpenShortcutCheatSheetShortcut(event) &&
        !shouldIgnoreDesignerShortcut(event)
      ) {
        event.preventDefault()
        event.stopPropagation()
        setOpenShortcutCheatSheet(true)
        return
      }

      if (isPlayMode() && event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        setMainMode(getLastEditorMode())
        return
      }

      if (
        isBasicSnippet() &&
        isBuildMode() &&
        !shouldIgnoreDesignerShortcut(event)
      ) {
        if (isUndoShortcut(event)) {
          event.preventDefault()
          event.stopPropagation()
          queueBuildHistoryAction("undo")
          return
        }

        if (isRedoShortcut(event)) {
          event.preventDefault()
          event.stopPropagation()
          queueBuildHistoryAction("redo")
          return
        }
      }

      if (!isRunShortcut(event)) return
      event.preventDefault()
      event.stopPropagation()
      runInPlayMode()
    }

    window.addEventListener("keydown", onWindowKeyDown, true)
    onCleanup(() => {
      window.removeEventListener("keydown", onWindowKeyDown, true)
    })
  })

  createEffect(() => {
    if (!getInlineRenameSnippetId()) return
    window.setTimeout(() => {
      renameInputEl?.focus()
      renameInputEl?.select()
    }, 0)
  })

  createEffect(
    on(getSearchType, () => {
      setSearchKeyword("")
    })
  )

  createEffect(() => {
    if (!isBasicSnippet() && getMainMode() !== "code") {
      setLastEditorMode("code")
      setMainMode("code")
    }
  })

  createEffect(
    on(
      () => searchParams.id,
      () => {
        if (typingIdleTimeoutId !== null) {
          window.clearTimeout(typingIdleTimeoutId)
          typingIdleTimeoutId = null
        }
        setIsEditorTyping(false)
        setPinnedActiveSnippetSortDate(null)
        setPendingBuildInsert(null)
        setPendingBuildJump(null)
        setPendingBuildHistoryAction(null)
        if (isBasicSnippet() && isPlayMode()) {
          setPlayRunVersion((version) => version + 1)
        }
      }
    )
  )

  createEffect(
    on(content, () => {
      if (isBasicSnippet() && isPlayMode()) {
        setPlayRunVersion((version) => version + 1)
      }
    })
  )

  // load snippets from active storage
  createEffect(
    on(
      () => [state.app.storageMode, state.app.storageFolder],
      () => {
        void actions.loadActiveStorage()

        // reload snippets every 2 seconds for external/local file changes
        const watchStorage = window.setInterval(() => {
          if (
            getInlineRenameSnippetId() ||
            getIsCodeEditorFocused() ||
            getIsEditorTyping() ||
            getIsContentDirty()
          ) {
            return
          }
          void actions.loadActiveStorage()
        }, 2000)

        onCleanup(() => {
          window.clearInterval(watchStorage)
        })
      }
    )
  )

  const loadContent = async () => {
    if (!searchParams.id) return

    if (
      getIsContentDirty() ||
      getIsSavingContent() ||
      getIsEditorTyping() ||
      getIsCodeEditorFocused()
    ) {
      return
    }

    const targetId = searchParams.id
    const revisionAtStart = latestContentRevision
    const requestId = ++contentLoadRequestId
    const nextContent = await actions.readSnippetContent(targetId)
    if (requestId !== contentLoadRequestId) return
    if (searchParams.id !== targetId) return
    if (revisionAtStart !== latestContentRevision) return
    if (
      getIsContentDirty() ||
      getIsSavingContent() ||
      getIsEditorTyping() ||
      getIsCodeEditorFocused()
    ) {
      return
    }
    if (nextContent !== content()) {
      setContent(nextContent)
    }
  }

  // load snippet content
  createEffect(
    on(
      () => [searchParams.id],
      () => {
        contentLoadRequestId += 1
        latestContentRevision = 0
        setIsContentDirty(false)
        setIsSavingContent(false)
        void loadContent()

        // reload snippet content every 2 seconds
        const watchFile = window.setInterval(() => {
          if (getIsCodeEditorFocused() || getIsEditorTyping()) {
            return
          }
          void loadContent()
        }, 2000)

        onCleanup(() => {
          window.clearInterval(watchFile)
        })
      }
    )
  )

  // unselect snippets
  createEffect(
    on([() => searchParams.id, getSearchType], () => {
      setSelectedSnippetIds([])
    })
  )

  return (
    <div class="h-screen" classList={{ "is-mac": state.isMac }}>
      <div class="h-main flex">
        <div
          class="border-r w-64 shrink-0 h-full flex flex-col"
          onDragOver={handleSidebarDragOver}
          onDrop={handleSidebarDrop}
        >
          <div class="sidebar-header text-zinc-500 dark:text-zinc-300 text-xs">
            <Show when={state.isMac}>
              <div class="h-6" data-tauri-drag-region></div>
            </Show>
            <div class="px-3 pb-2">
              <div class="h-2/5 flex items-center gap-1">
                <input
                  ref={searchInputEl}
                  spellcheck={false}
                  placeholder="Search"
                  class="h-7 flex-1 min-w-0 flex items-center px-2 border rounded-lg bg-transparent focus:ring focus:border-blue-500 ring-blue-500 focus:outline-none"
                  value={getSearchKeyword()!}
                  onInput={(e) => setSearchKeyword(e.currentTarget.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => collapseSearch()}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault()
                      if (getSearchType() === "trash") {
                        setSearchType("non-trash")
                      }
                      collapseSearch({ clearKeyword: true })
                    }
                  }}
                />
                <Button
                  type="button"
                  icon="i-ic:outline-add"
                  onMouseDown={handleNewSnippetMouseDown}
                  onClick={handleNewSnippetClick}
                  tooltip={{ content: "New script" }}
                ></Button>
                <Show when={!getIsSearchFocused() || Boolean(getDraggedSnippetId())}>
                  <button
                    ref={trashButtonEl}
                    type="button"
                    title="Show scripts in trash"
                    class="inline-flex items-center justify-center h-6 w-6 rounded-lg transition-colors ring-0 outline-none focus:outline-none focus-visible:outline-none focus:ring-0 active:ring-0"
                    classList={{
                      "bg-zinc-200 dark:text-white dark:bg-zinc-600":
                        getIsTrashDropTarget() && getSearchType() !== "trash",
                      "bg-blue-500 text-white": getSearchType() === "trash",
                      "hover:bg-zinc-200 dark:hover:text-white dark:hover:bg-zinc-600":
                        getSearchType() !== "trash" && !getIsTrashDropTarget(),
                    }}
                    onClick={handleTrashButtonClick}
                    onDragEnter={handleTrashDragOver}
                    onDragOver={handleTrashDragOver}
                    onDragLeave={handleTrashDragLeave}
                    onDrop={(e) => void handleTrashDrop(e)}
                  >
                    <span class="w-4 h-4 shrink-0 i-iconoir:bin"></span>
                  </button>
                  <Button
                    type="button"
                    icon="i-ic:baseline-settings"
                    onClick={openSettings}
                    tooltip={{ content: "Settings" }}
                  ></Button>
                </Show>
              </div>
            </div>
          </div>
          <div class="sidebar-body group/sidebar-body flex-1 overflow-y-auto custom-scrollbar scrollbar-group p-2 pt-0">
            <For each={groupedSnippets()}>
              {(group) => (
                <div class="space-y-1">
                  <Show when={group.label}>
                    <div class="px-2 pt-2 pb-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                      {group.label}
                    </div>
                  </Show>
                  <For each={group.snippets}>
                    {(snippet) => {
                      return (
                        <Link
                          href={`/scripts?${new URLSearchParams({ id: snippet.id }).toString()}`}
                          draggable={
                            getSearchType() !== "trash" &&
                            getInlineRenameSnippetId() !== snippet.id
                          }
                          classList={{
                            "group text-sm px-2 block select-none rounded-lg py-1":
                              true,
                            "cursor-grab":
                              getSearchType() !== "trash" &&
                              getInlineRenameSnippetId() !== snippet.id,
                            "cursor-grabbing":
                              getSearchType() !== "trash" &&
                              getInlineRenameSnippetId() !== snippet.id &&
                              getDraggedSnippetId() === snippet.id,
                            "bg-blue-500": isSidebarSnippetActive(snippet.id),
                            "hover:bg-zinc-100 dark:hover:bg-zinc-600":
                              !isSidebarSnippetActive(snippet.id),
                            "text-white": isSidebarSnippetActive(snippet.id),
                          }}
                          onClick={(e) => {
                            if (getSearchType() === "trash") {
                              e.preventDefault()
                              e.stopPropagation()
                              void restoreSnippetFromTrash(snippet.id, {
                                openAfterRestore: true,
                                withPrompt: true,
                              })
                              return
                            }

                            if (e.shiftKey) {
                              e.preventDefault()
                              setSelectedSnippetIds((ids) => {
                                if (ids.includes(snippet.id)) {
                                  return ids.filter((_id) => _id !== snippet.id)
                                }
                                return [...ids, snippet.id]
                              })
                            }
                          }}
                          onDragStart={(e) => handleSnippetDragStart(e, snippet.id)}
                          onDragEnd={(e) => void handleSnippetDragEnd(e)}
                          onDragOver={handleSnippetDragOver}
                        >
                          <Show
                            when={
                              getSearchType() !== "trash" &&
                              getInlineRenameSnippetId() === snippet.id
                            }
                            fallback={
                              <div
                                class="truncate"
                                onDblClick={(e) =>
                                  getSearchType() !== "trash" &&
                                  startInlineRename(e, snippet.id, snippet.name)
                                }
                              >
                                {snippet.name}
                              </div>
                            }
                          >
                            <input
                              ref={renameInputEl}
                              spellcheck={false}
                              class="h-6 w-full px-1 rounded border bg-transparent text-sm"
                              classList={{
                                "text-white border-blue-300":
                                  isSidebarSnippetActive(snippet.id),
                                "text-zinc-900 dark:text-zinc-100 border-blue-500":
                                  !isSidebarSnippetActive(snippet.id),
                              }}
                              value={getInlineRenameValue()}
                              onInput={(e) =>
                                setInlineRenameValue(e.currentTarget.value)
                              }
                              onMouseDown={(e) => {
                                e.stopPropagation()
                              }}
                              onClick={(e) => {
                                e.stopPropagation()
                              }}
                              onBlur={() => void saveInlineRename(snippet.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault()
                                  void saveInlineRename(snippet.id).then(() => {
                                    focusMainPane()
                                  })
                                } else if (e.key === "Tab") {
                                  e.preventDefault()
                                  void saveInlineRename(snippet.id).then(() => {
                                    focusMainPane()
                                  })
                                } else if (e.key === "Escape") {
                                  e.preventDefault()
                                  cancelInlineRename()
                                }
                              }}
                            />
                          </Show>
                        </Link>
                      )
                    }}
                  </For>
                </div>
              )}
            </For>
          </div>
          <Show when={getSearchType() === "trash"}>
            <div class="border-t px-3 py-2">
              <button
                type="button"
                disabled={snippets().length === 0}
                class="w-full whitespace-nowrap border-zinc-400 dark:border-zinc-600 border h-7 rounded-md px-2 inline-flex items-center justify-center text-xs"
                classList={{
                  "active:bg-zinc-200 dark:active:bg-zinc-700":
                    snippets().length !== 0,
                  "disabled:opacity-50": true,
                }}
                onClick={emptyTrash}
              >
                Empty Trash
              </button>
            </div>
          </Show>
        </div>
        <Show
          when={Boolean(snippet()) || isSettingsView()}
          fallback={
            <div
              data-tauri-drag-region
              class="h-full w-full flex items-center justify-center px-20 text-center text-zinc-400 text-xl"
            >
              <span class="select-none">
                {getSearchType() === "trash"
                  ? "Select a file to restore or empty the trash"
                  : hasActiveStorage()
                    ? "Select or create a script from sidebar"
                    : "Select a folder in Settings to use folder storage"}
              </span>
            </div>
          }
        >
          <div class="w-full h-full flex flex-col">
            <Show when={state.isMac}>
              <div class="h-6 shrink-0" data-tauri-drag-region></div>
            </Show>
            <Show
              when={isSettingsView()}
              fallback={
                <>
            <div
              data-tauri-drag-region
              class="border-b flex h-mainHeader shrink-0 items-center px-3"
            >
              <div class="flex-1"></div>
              <div class="flex-1 flex justify-center">
                <Show
                  when={isBasicSnippet()}
                  fallback={
                    <div class="inline-flex items-center rounded-lg border overflow-hidden h-8">
                      <button
                        type="button"
                        title="Code"
                        class="cursor w-9 h-full bg-blue-500 text-white inline-flex items-center justify-center"
                      >
                        <span class="w-[1.1rem] h-[1.1rem] shrink-0 i-ic:outline-terminal"></span>
                      </button>
                    </div>
                  }
                >
                  <div class="inline-flex items-center rounded-lg border overflow-hidden h-8">
                    <button
                      type="button"
                      title={`Run in Play (${runShortcutLabel()})`}
                      class="cursor w-9 h-full inline-flex items-center justify-center"
                      classList={{
                        "bg-blue-500 text-white": isPlayMode(),
                        "hover:bg-zinc-100 dark:hover:bg-zinc-700":
                          !isPlayMode(),
                      }}
                      onClick={runInPlayMode}
                    >
                      <span class="w-[1.1rem] h-[1.1rem] shrink-0 i-ic:baseline-play-arrow"></span>
                    </button>
                    <button
                      type="button"
                      title="Code"
                      class="cursor w-9 h-full border-l inline-flex items-center justify-center"
                      classList={{
                        "bg-blue-500 text-white": getMainMode() === "code",
                        "hover:bg-zinc-100 dark:hover:bg-zinc-700":
                          getMainMode() !== "code",
                      }}
                      onClick={() => setEditorMode("code")}
                    >
                      <span class="w-[1.1rem] h-[1.1rem] shrink-0 i-ic:outline-terminal"></span>
                    </button>
                    <button
                      type="button"
                      title="Build"
                      class="cursor w-9 h-full border-l inline-flex items-center justify-center"
                      classList={{
                        "bg-blue-500 text-white": isBuildMode(),
                        "hover:bg-zinc-100 dark:hover:bg-zinc-700":
                          !isBuildMode(),
                      }}
                      onClick={() => setEditorMode("build")}
                    >
                      <span class="w-[1.1rem] h-[1.1rem] shrink-0 i-ic:outline-extension"></span>
                    </button>
                  </div>
                </Show>
              </div>
              <div class="flex-1 flex items-center justify-end text-xs text-zinc-500 dark:text-zinc-300 space-x-1">
                <Show when={isBasicSnippet() && !isPlayMode()}>
                  <Button
                    type="button"
                    icon="i-ic:outline-find-in-page"
                    iconClass="w-5 h-5"
                    onClick={openLineJump}
                    tooltip={{ content: "Jump to BASIC line number" }}
                  />
                </Show>
                <Show when={isBasicSnippet() && !isPlayMode()}>
                  <Button
                    type="button"
                    icon="i-majesticons:curly-braces"
                    iconClass="w-5 h-5"
                    onClick={() => setOpenBasicCommandModal(true)}
                    tooltip={{ content: "Insert BASIC command reference" }}
                  />
                </Show>
                <Button
                  type="button"
                  icon="i-ic:baseline-keyboard-command-key"
                  iconClass="w-5 h-5"
                  onClick={() => setOpenShortcutCheatSheet(true)}
                  tooltip={{ content: "Keyboard shortcuts (F1)" }}
                />
              </div>
            </div>
            <div
              ref={mainPaneEl}
              class="flex-1 min-h-0"
              classList={{
                "overflow-y-auto": !isBasicSnippet() || getMainMode() === "code",
                "overflow-hidden": isBasicSnippet() && getMainMode() !== "code",
              }}
            >
              <Show
                when={isBasicSnippet()}
                fallback={
                  <Editor
                    value={content()}
                    onChange={handleEditorChange}
                    onTemplateTrigger={() => setOpenBasicCommandModal(true)}
                    onPasteTransform={transformPastedBasicSource}
                    onFocusChange={(focused) => setIsCodeEditorFocused(focused)}
                    onViewReady={(view) => {
                      editorView = view
                    }}
                    extensions={editorExtensions()}
                  />
                }
              >
                <div
                  class="h-full w-full"
                  classList={{ hidden: getMainMode() !== "code" }}
                >
                  <Editor
                    value={content()}
                    onChange={handleEditorChange}
                    onTemplateTrigger={() => setOpenBasicCommandModal(true)}
                    onPasteTransform={transformPastedBasicSource}
                    onFocusChange={(focused) => setIsCodeEditorFocused(focused)}
                    onViewReady={(view) => {
                      editorView = view
                    }}
                    extensions={editorExtensions()}
                  />
                </div>
                <div
                  class="h-full w-full"
                  classList={{ hidden: !isBuildMode() }}
                >
                  <BasicBlocklyEditor
                    source={content()}
                    onSourceChange={handleEditorChange}
                    isVisible={isBuildMode()}
                    pendingInsert={getPendingBuildInsert()}
                    onPendingInsertHandled={(id) => {
                      if (getPendingBuildInsert()?.id === id) {
                        setPendingBuildInsert(null)
                      }
                    }}
                    pendingJump={getPendingBuildJump()}
                    onPendingJumpHandled={(id) => {
                      if (getPendingBuildJump()?.id === id) {
                        setPendingBuildJump(null)
                      }
                    }}
                    pendingHistoryAction={getPendingBuildHistoryAction()}
                    onPendingHistoryActionHandled={(id) => {
                      if (getPendingBuildHistoryAction()?.id === id) {
                        setPendingBuildHistoryAction(null)
                      }
                    }}
                  />
                </div>
                <div
                  class="h-full w-full"
                  classList={{ hidden: !isPlayMode() }}
                >
                  <BasicRunnerCanvas
                    source={content()}
                    snippetName={snippet()!.name}
                    runVersion={getPlayRunVersion()}
                    paletteMode={state.app.playerPaletteMode}
                    class="h-full w-full bg-black overflow-hidden flex items-center justify-center relative"
                  />
                </div>
              </Show>
            </div>
                </>
              }
            >
              <div
                data-tauri-drag-region
                class="border-b flex h-mainHeader shrink-0 items-center px-3"
              >
                <div class="text-sm font-medium">Settings</div>
              </div>
              <div class="flex-1 min-h-0">
                <SettingsPanel />
              </div>
            </Show>
          </div>
        </Show>
      </div>
      <footer class="h-footer"></footer>
      <BasicCommandModal
        open={getOpenBasicCommandModal()}
        setOpen={setOpenBasicCommandModal}
        insertCommandSnippet={insertBasicCommandSnippet}
        allowedKinds={isBuildMode() ? ["statement"] : undefined}
      />
      <LineJumpModal
        open={getOpenLineJumpModal()}
        setOpen={setOpenLineJumpModal}
        jumpToLine={jumpToBasicLine}
      />
      <ShortcutCheatSheetModal
        open={getOpenShortcutCheatSheet()}
        setOpen={setOpenShortcutCheatSheet}
        isMac={state.isMac}
      />
      <div
        classList={{
          "-bottom-10": getSelectedSnippetIds().length === 0,
          "bottom-10": getSelectedSnippetIds().length > 0,
        }}
        class="fixed left-1/2 transform -translate-x-1/2"
        style="transition: bottom .3s ease-in-out"
      >
          <button
            type="button"
            class="cursor inline-flex items-center bg-white dark:bg-zinc-700 rounded-lg shadow border px-3 h-9 hover:bg-zinc-100"
            onClick={moveSelectedSnippetsToTrashOrRestore}
          >
            {getSearchType() === "trash"
              ? `Restore ${actualSelectedSnippetIds().length} scripts from Trash`
              : `Move ${actualSelectedSnippetIds().length} scripts to Trash`}
          </button>
        </div>
      </div>
  )
}

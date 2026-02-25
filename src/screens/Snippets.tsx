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
} from "../components/Modal"
import { languages } from "../lib/languages"
import { debounce } from "../lib/utils"
import { actions, state } from "../store"
import { Button } from "../components/Button"
import { timeago } from "../lib/date"
import { BasicRunnerCanvas } from "../components/BasicRunnerCanvas"

type SnippetMainMode = "play" | "code" | "build"

export const Snippets = () => {
  const goto = useNavigate()
  const [searchParams] = useSearchParams<{ id?: string }>()
  const [content, setContent] = createSignal("")
  const [getOpenBasicCommandModal, setOpenBasicCommandModal] =
    createSignal(false)
  const [getOpenLineJumpModal, setOpenLineJumpModal] = createSignal(false)
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
  const [getPlayRunVersion, setPlayRunVersion] = createSignal(0)
  const [getPendingBuildInsert, setPendingBuildInsert] =
    createSignal<BasicBlocklyPendingInsert | null>(null)
  const [getPendingBuildJump, setPendingBuildJump] =
    createSignal<BasicBlocklyPendingJump | null>(null)
  const [getPendingBuildHistoryAction, setPendingBuildHistoryAction] =
    createSignal<BasicBlocklyPendingHistoryAction | null>(null)

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
        if (a.deletedAt && b.deletedAt) {
          return a.deletedAt > b.deletedAt ? -1 : 1
        }
        return a.createdAt > b.createdAt ? -1 : 1
      })
  })

  const actualSelectedSnippetIds = createMemo(() => {
    const ids = [...getSelectedSnippetIds()]
    if (searchParams.id && snippets().some((s) => s.id === searchParams.id)) {
      ids.push(searchParams.id)
    }
    return ids
  })

  const snippet = createMemo(() =>
    state.snippets.find((snippet) => snippet.id === searchParams.id)
  )

  const isSidebarSnippetActive = (id: string) => {
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

  const runInPlayMode = () => {
    if (!isBasicSnippet()) return
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
    setMainMode(state.app.defaultEditor)
    goto(`/scripts?${new URLSearchParams({ id }).toString()}`)
  }

  const openSettings = () => {
    goto("/settings")
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
    setDraggedSnippetId(null)
    setTrashDropSnippetId(null)
    setIsTrashDropTarget(false)
  }

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

    if (!(await confirm(`Are you sure you want to move this script to Trash?`))) {
      return
    }

    await actions.moveSnippetsToTrash([draggedSnippetId])
    setSelectedSnippetIds((ids) => ids.filter((id) => id !== draggedSnippetId))
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

    handledTrashDropForCurrentDrag = false
    suppressTrashButtonClick = false
    setTrashDropSnippetId(null)
    setIsTrashDropTarget(false)
    setDraggedSnippetId(snippetId)
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData("application/x-gamenotepad-script-id", snippetId)
      e.dataTransfer.setData("text/plain", snippetId)
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
      setTrashDropSnippetId(null)
      setIsTrashDropTarget(false)
      return
    }

    const targetSnippet = state.snippets.find(
      (snippet) => snippet.id === draggedSnippetId
    )
    if (!targetSnippet || targetSnippet.deletedAt) {
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

  const toggleTrashFilter = () => {
    if (getSearchType() === "trash") {
      setSearchType("non-trash")
      return
    }
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
    toggleTrashFilter()
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
    if (value === content()) return

    const currentSnippet = snippet()
    if (!currentSnippet) return

    setContent(value)
    setIsContentDirty(true)
    latestContentRevision += 1
    persistEditorChange(currentSnippet.id, value, latestContentRevision)
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
    if (
      await confirm(
        restore
          ? `Are you sure you want to restore selected scripts from Trash`
          : `Are you sure you want to move selected scripts to Trash?`
      )
    ) {
      await actions.moveSnippetsToTrash(actualSelectedSnippetIds(), restore)
      setSelectedSnippetIds([])
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

  createEffect(() => {
    if (getSearchType()) {
      searchInputEl?.focus()
    }
  })

  createEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
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
      setMainMode("code")
    }
  })

  createEffect(
    on(
      () => searchParams.id,
      () => {
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
          if (getInlineRenameSnippetId()) return
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

    if (getIsContentDirty() || getIsSavingContent()) return

    const targetId = searchParams.id
    const content = await actions.readSnippetContent(targetId)
    if (searchParams.id !== targetId) return
    setContent(content)
  }

  // load snippet content
  createEffect(
    on(
      () => [searchParams.id],
      () => {
        latestContentRevision = 0
        setIsContentDirty(false)
        setIsSavingContent(false)
        loadContent()

        // reload snippet content every 2 seconds
        const watchFile = window.setInterval(async () => {
          loadContent()
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
        <div class="border-r w-64 shrink-0 h-full flex flex-col">
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
                  onBlur={() => setIsSearchFocused(false)}
                  onKeyPress={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault()
                      if (getSearchType() === "trash") {
                        setSearchType("non-trash")
                        return
                      }
                      setSearchKeyword("")
                    }
                  }}
                />
                <Button
                  type="button"
                  icon="i-ic:outline-add"
                  onClick={newSnippet}
                  tooltip={{ content: "New script" }}
                ></Button>
                <Show when={!getIsSearchFocused()}>
                  <button
                    ref={trashButtonEl}
                    type="button"
                    title="Show scripts in trash"
                    class="inline-flex items-center justify-center h-6 w-6 rounded-lg cursor active:ring-2 ring-blue-500 transition-colors"
                    classList={{
                      "ring-2 ring-blue-500 bg-blue-500/10": getIsTrashDropTarget(),
                      "bg-blue-500 text-white": getSearchType() === "trash",
                      "hover:bg-zinc-200 dark:hover:text-white dark:hover:bg-zinc-600":
                        getSearchType() !== "trash",
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
              <Show when={getSearchType() === "trash"}>
                <div class="flex justify-end pt-1">
                  <button
                    type="button"
                    disabled={snippets().length === 0}
                    class="cursor whitespace-nowrap border-zinc-400 dark:border-zinc-600 border h-6 rounded-md px-2 flex items-center text-xs"
                    classList={{
                      "active:bg-zinc-200 dark:active:bg-zinc-700":
                        snippets().length !== 0,
                      "disabled:opacity-50": true,
                    }}
                    onClick={emptyTrash}
                  >
                    Empty
                  </button>
                </div>
              </Show>
            </div>
          </div>
          <div class="sidebar-body group/sidebar-body flex-1 overflow-y-auto custom-scrollbar scrollbar-group p-2 pt-0 space-y-1">
            <For each={snippets()}>
              {(snippet) => {
                return (
                  <Link
                    href={`/scripts?${new URLSearchParams({ id: snippet.id }).toString()}`}
                    draggable={getInlineRenameSnippetId() !== snippet.id}
                    classList={{
                      "group text-sm px-2 block select-none rounded-lg py-1 cursor":
                        true,
                      "bg-blue-500": isSidebarSnippetActive(snippet.id),
                      "hover:bg-zinc-100 dark:hover:bg-zinc-600":
                        !isSidebarSnippetActive(snippet.id),
                      "text-white": isSidebarSnippetActive(snippet.id),
                    }}
                    onClick={(e) => {
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
                  >
                    <Show
                      when={getInlineRenameSnippetId() === snippet.id}
                      fallback={
                        <div
                          class="truncate"
                          onDblClick={(e) =>
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
                          "text-white border-blue-300": isSidebarSnippetActive(
                            snippet.id
                          ),
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
                    <div
                      class="text-xs mt-[1px]"
                      classList={{
                        "text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-400":
                          !isSidebarSnippetActive(snippet.id),
                        "text-blue-100": isSidebarSnippetActive(snippet.id),
                      }}
                    >
                      <span class="truncate">{timeago(snippet.createdAt)}</span>
                    </div>
                  </Link>
                )
              }}
            </For>
          </div>
        </div>
        <Show
          when={snippet()}
          fallback={
            <div
              data-tauri-drag-region
              class="h-full w-full flex items-center justify-center px-20 text-center text-zinc-400 text-xl"
            >
              <span class="select-none">
                {hasActiveStorage()
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
                      onClick={() => setMainMode("code")}
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
                      onClick={() => setMainMode("build")}
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
                when={isBasicSnippet() && isPlayMode()}
                fallback={
                  <Show
                    when={isBasicSnippet() && isBuildMode()}
                    fallback={
                      <Editor
                        value={content()}
                        onChange={handleEditorChange}
                        onTemplateTrigger={() => setOpenBasicCommandModal(true)}
                        onViewReady={(view) => {
                          editorView = view
                        }}
                        extensions={editorExtensions()}
                      />
                    }
                  >
                    <BasicBlocklyEditor
                      source={content()}
                      onSourceChange={handleEditorChange}
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
                  </Show>
                }
              >
                <BasicRunnerCanvas
                  source={content()}
                  snippetName={snippet()!.name}
                  runVersion={getPlayRunVersion()}
                  class="h-full w-full bg-black overflow-hidden flex items-center justify-center relative"
                />
              </Show>
            </div>
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

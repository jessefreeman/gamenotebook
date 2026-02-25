import { useNavigate } from "@solidjs/router"
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type JSX,
} from "solid-js"
import { Portal } from "solid-js/web"
import {
  BASIC_COMMAND_ENTRIES,
  type BasicCommandKind,
  type BasicCommandEntry,
} from "../basic/command-templates"
import { useOpenFolderDialog } from "../lib/open-folder"
import { state } from "../store"

const Modal = (props: { children: JSX.Element; close: () => void }) => {
  let modal: HTMLDivElement | undefined

  onMount(() => {
    const handleClick = (e: MouseEvent) => {
      if (!modal) return

      if (modal.contains(e.target as Element)) {
        return
      }

      // click outside
      props.close()
    }
    document.addEventListener("click", handleClick)

    onCleanup(() => {
      document.removeEventListener("click", handleClick)
    })
  })

  return (
    <Portal mount={document.getElementById("modal-container") || undefined}>
      <div class="modal" ref={modal}>
        {props.children}
      </div>
    </Portal>
  )
}

interface Item {
  icon?: string
  text: string
  syntax?: string
  detail?: string
  onClick: () => void
}

const PromptModal = (props: {
  placeholder?: string
  items: Item[]
  selectedItemIndex?: number
  close: () => void
  keyword: string
  setKeyword: (keyword: string) => void
  emptyMessage?: string
}) => {
  let input: HTMLInputElement | undefined

  const [getSelectedIndex, setSelectedIndex] = createSignal(
    props.selectedItemIndex || 0
  )

  const closeModal = () => {
    props.close()
    props.setKeyword("")
  }

  onMount(() => {
    input?.focus()
  })

  const scrollItemIntoView = (index: number) => {
    ;(document.getElementById(`item-${index}`) as any)?.scrollIntoViewIfNeeded()
  }

  createEffect(() => {
    scrollItemIntoView(getSelectedIndex())
  })

  createEffect(() => {
    if (props.items.length === 0) {
      setSelectedIndex(0)
      return
    }

    setSelectedIndex((index) => {
      if (index < 0) return 0
      if (index >= props.items.length) return props.items.length - 1
      return index
    })
  })

  return (
    <Modal close={closeModal}>
      <label class="block px-2 py-2">
        <input
          ref={input}
          placeholder={props.placeholder}
          spellcheck={false}
          class="w-full bg-zinc-100 dark:bg-zinc-700 focus:ring px-1 h-6 flex items-center"
          value={props.keyword}
          onInput={(e) => props.setKeyword(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault()
              closeModal()
            } else if (e.key === "ArrowDown") {
              if (props.items.length === 0) return
              setSelectedIndex((index) =>
                index === props.items.length - 1 ? 0 : index + 1
              )
            } else if (e.key === "ArrowUp") {
              if (props.items.length === 0) return
              setSelectedIndex((index) =>
                index === 0 ? props.items.length - 1 : index - 1
              )
            } else if (e.key === "Enter") {
              e.preventDefault()
              if (props.items.length === 0) return
              const item = props.items.find(
                (_, index) => index === getSelectedIndex()
              )
              if (item) {
                item.onClick()
              }
            }
          }}
        />
      </label>
      <div class="modal-content">
        <For each={props.items}>
          {(item, index) => (
            <div
              id={`item-${index()}`}
              class="px-2 py-1 cursor flex items-start text-left space-x-1"
              classList={{
                "bg-zinc-200 dark:bg-zinc-700": getSelectedIndex() === index(),
                "hover:bg-zinc-100 dark:hover:bg-zinc-700":
                  getSelectedIndex() !== index(),
              }}
              onClick={item.onClick}
            >
              <Show when={item.icon}>
                <span classList={{ [item.icon!]: true }}></span>
              </Show>
              <div class="min-w-0 text-left">
                <div class="truncate">{item.text}</div>
                <Show when={item.syntax}>
                  <div class="truncate font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                    {item.syntax}
                  </div>
                </Show>
                <Show when={item.detail}>
                  <div class="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                    {item.detail}
                  </div>
                </Show>
              </div>
            </div>
          )}
        </For>
        <Show when={props.items.length === 0}>
          <div class="px-2 py-2 text-xs text-zinc-500 dark:text-zinc-400">
            {props.emptyMessage || "No results"}
          </div>
        </Show>
      </div>
    </Modal>
  )
}

export const BasicCommandModal = (props: {
  insertCommandSnippet: (snippet: string) => void
  open: boolean
  setOpen: (open: boolean) => void
  allowedKinds?: BasicCommandKind[]
}) => {
  const [getKeyword, setKeyword] = createSignal("")

  const items: Accessor<Item[]> = createMemo(() => {
    const keyword = getKeyword().trim().toLowerCase()
    const terms = keyword ? keyword.split(/\s+/).filter(Boolean) : []

    return BASIC_COMMAND_ENTRIES
      .filter((entry: BasicCommandEntry) => {
        if (!props.allowedKinds || props.allowedKinds.length === 0) {
          return true
        }

        return props.allowedKinds.includes(entry.kind)
      })
      .filter((entry: BasicCommandEntry) => {
        if (terms.length === 0) return true

        const haystack = [entry.label, entry.syntax]
          .concat(entry.searchTokens)
          .join(" ")
          .toLowerCase()

        return terms.every((term) => haystack.includes(term))
      })
      .map((entry: BasicCommandEntry) => {
        return {
          text: entry.label,
          syntax: entry.syntax,
          detail: `${entry.kind}: ${entry.description}`,
          onClick() {
            props.insertCommandSnippet(entry.insertSnippet)
            props.setOpen(false)
            setKeyword("")
          },
        }
      })
  })

  return (
    <Show when={props.open}>
      <PromptModal
        keyword={getKeyword()}
        setKeyword={setKeyword}
        placeholder="Search BASIC commands/functions"
        items={items()}
        close={() => props.setOpen(false)}
      ></PromptModal>
    </Show>
  )
}

export const LineJumpModal = (props: {
  open: boolean
  setOpen: (open: boolean) => void
  jumpToLine: (lineNumber: number) => void
}) => {
  const [getKeyword, setKeyword] = createSignal("")

  const items = createMemo<Item[]>(() => {
    const value = getKeyword().trim()
    if (!value) return []
    if (!/^\d+$/.test(value)) return []

    const lineNumber = Number.parseInt(value, 10)
    if (!Number.isInteger(lineNumber) || lineNumber <= 0) {
      return []
    }

    return [
      {
        text: `Go to line ${lineNumber}`,
        syntax: `line ${lineNumber}`,
        detail: "Press Enter to jump",
        onClick() {
          props.jumpToLine(lineNumber)
          props.setOpen(false)
          setKeyword("")
        },
      },
    ]
  })

  return (
    <Show when={props.open}>
      <PromptModal
        keyword={getKeyword()}
        setKeyword={setKeyword}
        placeholder="Jump to BASIC line number"
        items={items()}
        emptyMessage="Type a positive line number"
        close={() => props.setOpen(false)}
      ></PromptModal>
    </Show>
  )
}

export const FolderHistoryModal = (props: {
  open: boolean
  setOpen: (open: boolean) => void
}) => {
  const [getKeyword, setKeyword] = createSignal("")
  const goto = useNavigate()
  const openAnotherFolder = useOpenFolderDialog()

  const items = createMemo<Item[]>(() =>
    state.app.folders
      .filter((folder) => {
        const keyword = getKeyword()
        if (!keyword) return true
        return folder.toLowerCase().includes(keyword)
      })
      .map<Item>((folder) => {
        return {
          icon: "i-bi:folder",
          text: folder,
          onClick() {
            goto(
              `/scripts?${new URLSearchParams({ folder: folder }).toString()}`
            )
            props.setOpen(false)
          },
        }
      })
      .concat([
        {
          icon: "i-bi:folder-plus",
          text: "Open another folder",
          onClick() {
            openAnotherFolder()
            props.setOpen(false)
          },
        },
      ])
  )

  return (
    <Show when={props.open}>
      <PromptModal
        placeholder="Filter previously opened folders"
        keyword={getKeyword()}
        setKeyword={setKeyword}
        items={items()}
        close={() => props.setOpen(false)}
      ></PromptModal>
    </Show>
  )
}

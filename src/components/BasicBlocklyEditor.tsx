import { createEffect, on, onCleanup, onMount } from "solid-js"
import * as Blockly from "blockly/core"
import "blockly/blocks"
import * as En from "blockly/msg/en"
import {
  emitBasicSourceFromVisualLines,
  parseBasicSourceToVisualLines,
  parseBasicStatementToVisual,
} from "../basic/blockly-model"
import {
  appendVisualLineToWorkspace,
  ensureBasicBlocklyBlocks,
  findVisualBlockByLineNumber,
  loadVisualLinesIntoWorkspace,
  readVisualLinesFromWorkspace,
  updateVisualLineNumberLabels,
} from "../basic/blockly-workspace"

Blockly.setLocale(En)

export type BasicBlocklyPendingInsert = {
  id: number
  statement: string
}

export type BasicBlocklyPendingJump = {
  id: number
  lineNumber: number
}

export const BasicBlocklyEditor = (props: {
  source: string
  onSourceChange: (source: string) => void
  pendingInsert?: BasicBlocklyPendingInsert | null
  onPendingInsertHandled?: (id: number) => void
  pendingJump?: BasicBlocklyPendingJump | null
  onPendingJumpHandled?: (id: number) => void
}) => {
  let hostEl: HTMLDivElement | undefined
  let workspace: Blockly.WorkspaceSvg | null = null
  let syncingFromSource = false
  let lastWorkspaceSource = ""

  const emitWorkspaceSource = () => {
    if (!workspace || syncingFromSource) return

    const lines = readVisualLinesFromWorkspace(workspace)
    const nextSource = emitBasicSourceFromVisualLines(lines)
    lastWorkspaceSource = nextSource

    if (nextSource !== props.source) {
      props.onSourceChange(nextSource)
    }
  }

  const loadSource = (source: string) => {
    if (!workspace) return

    syncingFromSource = true
    const lines = parseBasicSourceToVisualLines(source)
    loadVisualLinesIntoWorkspace(workspace, lines)
    updateVisualLineNumberLabels(workspace)
    lastWorkspaceSource = emitBasicSourceFromVisualLines(
      readVisualLinesFromWorkspace(workspace)
    )
    syncingFromSource = false
  }

  onMount(() => {
    if (!hostEl) {
      return
    }

    ensureBasicBlocklyBlocks()

    workspace = Blockly.inject(hostEl, {
      trashcan: true,
      move: {
        drag: true,
        scrollbars: true,
        wheel: true,
      },
      zoom: {
        controls: true,
        wheel: true,
        startScale: 1,
        maxScale: 2,
        minScale: 0.5,
        scaleSpeed: 1.1,
      },
      grid: {
        spacing: 20,
        length: 3,
        colour: "#d4d4d8",
        snap: false,
      },
    })

    const onWorkspaceChange = (event: Blockly.Events.Abstract) => {
      if (event.type === Blockly.Events.UI) return
      if (workspace) {
        updateVisualLineNumberLabels(workspace)
      }
      emitWorkspaceSource()
    }

    const resizeWorkspace = () => {
      if (workspace) {
        Blockly.svgResize(workspace)
      }
    }

    workspace.addChangeListener(onWorkspaceChange)
    loadSource(props.source)
    window.addEventListener("resize", resizeWorkspace)
    queueMicrotask(resizeWorkspace)

    onCleanup(() => {
      window.removeEventListener("resize", resizeWorkspace)
      workspace?.removeChangeListener(onWorkspaceChange)
      workspace?.dispose()
      workspace = null
    })
  })

  createEffect(() => {
    const source = props.source
    if (!workspace || syncingFromSource) return

    if (source === lastWorkspaceSource) {
      return
    }

    loadSource(source)
  })

  createEffect(
    on(
      () => props.pendingInsert,
      (pendingInsert) => {
        if (!pendingInsert || !workspace) return

        const statement = pendingInsert.statement.trim()
        if (!statement) {
          props.onPendingInsertHandled?.(pendingInsert.id)
          return
        }

        appendVisualLineToWorkspace(workspace, {
          legacyLineNumber: "",
          statement: parseBasicStatementToVisual(statement),
        })

        emitWorkspaceSource()
        props.onPendingInsertHandled?.(pendingInsert.id)
      }
    )
  )

  createEffect(
    on(
      () => props.pendingJump,
      (pendingJump) => {
        if (!pendingJump || !workspace) return

        updateVisualLineNumberLabels(workspace)
        const targetBlock = findVisualBlockByLineNumber(
          workspace,
          pendingJump.lineNumber
        )
        if (targetBlock) {
          workspace.centerOnBlock(targetBlock.id)
          const selectable = targetBlock as Blockly.Block & {
            select?: () => void
          }
          selectable.select?.()
          workspace.highlightBlock(targetBlock.id, true)
          window.setTimeout(() => {
            workspace?.highlightBlock(null)
          }, 800)
        }

        props.onPendingJumpHandled?.(pendingJump.id)
      }
    )
  )

  return <div ref={hostEl} class="basic-blockly-editor h-full w-full" />
}

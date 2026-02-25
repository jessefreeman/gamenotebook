import * as Blockly from "blockly/core"
import {
  emitBasicStatementFromVisual,
  parseBasicStatementToVisual,
  type BasicVisualLine,
  type BasicVisualStatement,
  type BasicVisualStatementKind,
} from "./blockly-model"

type BlocklyBlockDefinition = {
  type: string
  message0: string
  args0?: unknown[]
  message1?: string
  args1?: unknown[]
  message2?: string
  args2?: unknown[]
  previousStatement?: null
  nextStatement?: null
  colour: number
  tooltip?: string
}

type BlockMetadata = {
  legacyLineNumber?: string
  forNextVariable?: string
  forNextLegacyLineNumber?: string
}

type WorkspaceVisualNode = {
  line: BasicVisualLine
  forBody?: WorkspaceVisualNode[]
  ifThen?: WorkspaceVisualNode[]
  ifElse?: WorkspaceVisualNode[]
  forNextVariable?: string
  forNextLegacyLineNumber?: string
}

const FOR_BLOCK_TYPE = "basic_stmt_for"
const IF_BLOCK_TYPE = "basic_stmt_if"
const SCRIPT_ENTRY_BLOCK_TYPE = "basic_script_entry"
const LINE_NUMBER_FIELD_TYPE = "basic_line_number_field"

const BLOCK_TYPE_BY_KIND: Record<BasicVisualStatementKind, string> = {
  rem: "basic_stmt_rem",
  apostrophe: "basic_stmt_apostrophe",
  end: "basic_stmt_end",
  stop: "basic_stmt_stop",
  cls: "basic_stmt_cls",
  color: "basic_stmt_color",
  locate: "basic_stmt_locate",
  print: "basic_stmt_print",
  input: "basic_stmt_input",
  if: IF_BLOCK_TYPE,
  goto: "basic_stmt_goto",
  gosub: "basic_stmt_gosub",
  return: "basic_stmt_return",
  for: FOR_BLOCK_TYPE,
  next: "basic_stmt_next",
  dim: "basic_stmt_dim",
  pset: "basic_stmt_pset",
  line: "basic_stmt_line",
  rect: "basic_stmt_rect",
  let: "basic_stmt_let",
  assign: "basic_stmt_assign",
  raw: "basic_stmt_raw",
}

const KIND_BY_BLOCK_TYPE: Record<string, BasicVisualStatementKind> =
  Object.fromEntries(
    Object.entries(BLOCK_TYPE_BY_KIND).map(([kind, blockType]) => [
      blockType,
      kind as BasicVisualStatementKind,
    ])
  )

const STATEMENT_FIELD_KEYS: Record<BasicVisualStatementKind, string[]> = {
  rem: ["text"],
  apostrophe: ["text"],
  end: [],
  stop: [],
  cls: ["expr"],
  color: ["fg", "bg"],
  locate: ["col", "row"],
  print: ["value"],
  input: ["value"],
  if: ["condition"],
  goto: ["line"],
  gosub: ["line"],
  return: [],
  for: ["variable", "start", "end", "step"],
  next: ["variable"],
  dim: ["declarations"],
  pset: ["x", "y", "color"],
  line: ["x1", "y1", "x2", "y2", "color"],
  rect: ["x", "y", "width", "height", "color"],
  let: ["target", "value"],
  assign: ["target", "value"],
  raw: ["code"],
}

const toBlockFieldName = (
  kind: BasicVisualStatementKind,
  fieldName: string
): string => {
  if ((kind === "goto" || kind === "gosub") && fieldName === "line") {
    return "TARGET"
  }

  return fieldName.toUpperCase()
}

const parseBlockMetadata = (block: Blockly.Block): BlockMetadata => {
  if (!block.data) return {}

  try {
    const parsed = JSON.parse(block.data) as Partial<BlockMetadata>
    const metadata: BlockMetadata = {}

    if (typeof parsed.legacyLineNumber === "string") {
      metadata.legacyLineNumber = parsed.legacyLineNumber
    }
    if (typeof parsed.forNextVariable === "string") {
      metadata.forNextVariable = parsed.forNextVariable
    }
    if (typeof parsed.forNextLegacyLineNumber === "string") {
      metadata.forNextLegacyLineNumber = parsed.forNextLegacyLineNumber
    }

    return metadata
  } catch {
    return {}
  }
}

const setBlockMetadata = (
  block: Blockly.Block,
  patch: Partial<BlockMetadata>
): void => {
  const metadata = {
    ...parseBlockMetadata(block),
    ...patch,
  }

  block.data = JSON.stringify(metadata)
}

const normalizeVariableName = (value: string): string => value.trim().toUpperCase()

const SCRIPT_ENTRY_BLOCK_DEFINITION: BlocklyBlockDefinition = {
  type: SCRIPT_ENTRY_BLOCK_TYPE,
  message0: "SCRIPT",
  nextStatement: null,
  colour: 260,
}

class LineNumberField extends Blockly.FieldLabelSerializable {
  constructor(value = "") {
    super(value, "basic-block-line-number")
  }

  static fromJson(options: Blockly.FieldConfig): LineNumberField {
    const text =
      typeof (options as { text?: unknown }).text === "string"
        ? ((options as { text: string }).text ?? "")
        : ""

    return new LineNumberField(text)
  }

  initView(): void {
    this.createBorderRect_()
    super.initView()

    const border = this.getBorderRect()
    border.setAttribute("rx", "8")
    border.setAttribute("ry", "8")
    border.classList.add("basic-block-line-number-pill")
  }

  protected override render_(): void {
    super.render_()
    this.updateSize_(12)
    this.positionBorderRect_()
  }
}

const STATEMENT_BLOCK_DEFINITIONS: BlocklyBlockDefinition[] = [
  {
    type: "basic_stmt_rem",
    message0: "REM %1",
    args0: [
      {
        type: "field_input",
        name: "TEXT",
        text: "comment",
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 300,
  },
  {
    type: "basic_stmt_apostrophe",
    message0: "' %1",
    args0: [
      {
        type: "field_input",
        name: "TEXT",
        text: "comment",
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 300,
  },
  {
    type: "basic_stmt_end",
    message0: "END",
    previousStatement: null,
    nextStatement: null,
    colour: 10,
  },
  {
    type: "basic_stmt_stop",
    message0: "STOP",
    previousStatement: null,
    nextStatement: null,
    colour: 10,
  },
  {
    type: "basic_stmt_cls",
    message0: "CLS color %1",
    args0: [
      {
        type: "field_input",
        name: "EXPR",
        text: "",
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 160,
  },
  {
    type: "basic_stmt_color",
    message0: "COLOR fg %1 bg %2",
    args0: [
      {
        type: "field_input",
        name: "FG",
        text: "7",
      },
      {
        type: "field_input",
        name: "BG",
        text: "0",
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 160,
  },
  {
    type: "basic_stmt_locate",
    message0: "LOCATE col %1 row %2",
    args0: [
      {
        type: "field_input",
        name: "COL",
        text: "0",
      },
      {
        type: "field_input",
        name: "ROW",
        text: "0",
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 160,
  },
  {
    type: "basic_stmt_print",
    message0: "PRINT %1",
    args0: [
      {
        type: "field_input",
        name: "VALUE",
        text: "HELLO",
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 160,
  },
  {
    type: "basic_stmt_input",
    message0: "INPUT %1",
    args0: [
      {
        type: "field_input",
        name: "VALUE",
        text: "\"PROMPT\";A$",
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 160,
  },
  {
    type: IF_BLOCK_TYPE,
    message0: "IF %1",
    args0: [
      {
        type: "field_input",
        name: "CONDITION",
        text: "A=1",
      },
    ],
    message1: "THEN %1",
    args1: [
      {
        type: "input_statement",
        name: "THEN_BODY",
      },
    ],
    message2: "ELSE %1",
    args2: [
      {
        type: "input_statement",
        name: "ELSE_BODY",
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 40,
  },
  {
    type: "basic_stmt_goto",
    message0: "GOTO # %1",
    args0: [
      {
        type: "field_input",
        name: "TARGET",
        text: "1",
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 40,
  },
  {
    type: "basic_stmt_gosub",
    message0: "GOSUB # %1",
    args0: [
      {
        type: "field_input",
        name: "TARGET",
        text: "1",
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 40,
  },
  {
    type: "basic_stmt_return",
    message0: "RETURN",
    previousStatement: null,
    nextStatement: null,
    colour: 40,
  },
  {
    type: FOR_BLOCK_TYPE,
    message0: "FOR %1 = %2 TO %3 STEP %4",
    args0: [
      {
        type: "field_input",
        name: "VARIABLE",
        text: "I",
      },
      {
        type: "field_input",
        name: "START",
        text: "0",
      },
      {
        type: "field_input",
        name: "END",
        text: "10",
      },
      {
        type: "field_input",
        name: "STEP",
        text: "",
      },
    ],
    message1: "DO %1",
    args1: [
      {
        type: "input_statement",
        name: "BODY",
      },
    ],
    message2: "NEXT",
    previousStatement: null,
    nextStatement: null,
    colour: 40,
  },
  {
    type: "basic_stmt_next",
    message0: "NEXT %1",
    args0: [
      {
        type: "field_input",
        name: "VARIABLE",
        text: "",
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 40,
  },
  {
    type: "basic_stmt_dim",
    message0: "DIM %1",
    args0: [
      {
        type: "field_input",
        name: "DECLARATIONS",
        text: "A(8)",
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 200,
  },
  {
    type: "basic_stmt_pset",
    message0: "PSET x %1 y %2 color %3",
    args0: [
      {
        type: "field_input",
        name: "X",
        text: "0",
      },
      {
        type: "field_input",
        name: "Y",
        text: "0",
      },
      {
        type: "field_input",
        name: "COLOR",
        text: "",
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 160,
  },
  {
    type: "basic_stmt_line",
    message0: "LINE x1 %1 y1 %2 x2 %3 y2 %4 color %5",
    args0: [
      {
        type: "field_input",
        name: "X1",
        text: "0",
      },
      {
        type: "field_input",
        name: "Y1",
        text: "0",
      },
      {
        type: "field_input",
        name: "X2",
        text: "10",
      },
      {
        type: "field_input",
        name: "Y2",
        text: "10",
      },
      {
        type: "field_input",
        name: "COLOR",
        text: "",
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 160,
  },
  {
    type: "basic_stmt_rect",
    message0: "RECT x %1 y %2 w %3 h %4 color %5",
    args0: [
      {
        type: "field_input",
        name: "X",
        text: "0",
      },
      {
        type: "field_input",
        name: "Y",
        text: "0",
      },
      {
        type: "field_input",
        name: "WIDTH",
        text: "16",
      },
      {
        type: "field_input",
        name: "HEIGHT",
        text: "16",
      },
      {
        type: "field_input",
        name: "COLOR",
        text: "",
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 160,
  },
  {
    type: "basic_stmt_let",
    message0: "LET %1 = %2",
    args0: [
      {
        type: "field_input",
        name: "TARGET",
        text: "A",
      },
      {
        type: "field_input",
        name: "VALUE",
        text: "0",
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 200,
  },
  {
    type: "basic_stmt_assign",
    message0: "SET %1 = %2",
    args0: [
      {
        type: "field_input",
        name: "TARGET",
        text: "A",
      },
      {
        type: "field_input",
        name: "VALUE",
        text: "0",
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 200,
  },
  {
    type: "basic_stmt_raw",
    message0: "RAW %1",
    args0: [
      {
        type: "field_input",
        name: "CODE",
        text: "REM custom statement",
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 20,
  },
]

const withLineNumberLabel = (
  definition: BlocklyBlockDefinition
): BlocklyBlockDefinition => {
  const shiftedMessage = definition.message0.replace(/%(\d+)/g, (match, raw) => {
    const index = Number.parseInt(raw, 10)
    if (!Number.isInteger(index) || index < 1) {
      return match
    }
    return `%${index + 1}`
  })

  return {
    ...definition,
    message0: `%1 ${shiftedMessage}`,
    args0: [
      {
        type: LINE_NUMBER_FIELD_TYPE,
        name: "LINE_INDEX",
        text: "1",
      },
      ...(definition.args0 ?? []),
    ],
  }
}

const BASIC_BLOCK_DEFINITIONS = STATEMENT_BLOCK_DEFINITIONS.map(
  withLineNumberLabel
)

let blocksRegistered = false
let lineNumberFieldRegistered = false

export const ensureBasicBlocklyBlocks = (): void => {
  if (!lineNumberFieldRegistered) {
    try {
      Blockly.fieldRegistry.register(LINE_NUMBER_FIELD_TYPE, LineNumberField)
    } catch {
      // May already be registered by hot-reload.
    }
    lineNumberFieldRegistered = true
  }

  if (blocksRegistered || Blockly.Blocks[SCRIPT_ENTRY_BLOCK_TYPE]) {
    blocksRegistered = true
    return
  }

  Blockly.defineBlocksWithJsonArray([
    SCRIPT_ENTRY_BLOCK_DEFINITION,
    ...BASIC_BLOCK_DEFINITIONS,
  ])
  blocksRegistered = true
}

const isStatementVisualBlock = (block: Blockly.Block): boolean =>
  Object.prototype.hasOwnProperty.call(KIND_BY_BLOCK_TYPE, block.type)

const setupScriptEntryBlock = (block: Blockly.Block): void => {
  block.setMovable(false)
  block.setDeletable(false)
  block.setEditable(false)
}

const findScriptEntryBlock = (
  workspace: Blockly.WorkspaceSvg
): Blockly.Block | null =>
  workspace
    .getTopBlocks(false)
    .find((block) => block.type === SCRIPT_ENTRY_BLOCK_TYPE) ?? null

const ensureScriptEntryBlock = (workspace: Blockly.WorkspaceSvg): Blockly.Block => {
  const existing = findScriptEntryBlock(workspace)
  if (existing) {
    setupScriptEntryBlock(existing)
    return existing
  }

  const entry = workspace.newBlock(SCRIPT_ENTRY_BLOCK_TYPE)
  entry.initSvg()
  entry.render()
  entry.moveBy(32, 32)
  setupScriptEntryBlock(entry)
  return entry
}

const DETACHED_STATEMENT_PREFIX =
  /^(END|STOP|CLS|COLOR|LOCATE|PRINT|INPUT|IF|GOTO|GOSUB|RETURN|FOR|NEXT|DIM|PSET|LINE|RECT|LET)\b/i
const DETACHED_ASSIGNMENT_PREFIX = /^[A-Z][A-Z0-9_$]*(\([^)]*\))?\s*=/i
const normalizeJumpTarget = (value: string): string =>
  value.trim().replace(/^#\s*/, "")

const looksLikeDetachedStatementComment = (text: string): boolean =>
  DETACHED_STATEMENT_PREFIX.test(text) || DETACHED_ASSIGNMENT_PREFIX.test(text)

const parseDetachedCommentLine = (line: BasicVisualLine): BasicVisualLine | null => {
  if (line.statement.kind !== "apostrophe") return null

  const text = (line.statement.fields.text ?? "").trim()
  if (!text || !looksLikeDetachedStatementComment(text)) {
    return null
  }

  const statement = parseBasicStatementToVisual(text)
  if (statement.kind === "apostrophe" || statement.kind === "rem") {
    return null
  }

  return {
    legacyLineNumber: "",
    statement,
  }
}

const encodeDetachedCommentLine = (line: BasicVisualLine): BasicVisualLine => {
  const body = emitBasicStatementFromVisual(line.statement).trim()

  return {
    legacyLineNumber: "",
    statement: {
      kind: "apostrophe",
      fields: {
        text: body,
      },
    },
  }
}

const splitTopLevelInline = (text: string, delimiter: string): string[] => {
  const result: string[] = []
  let start = 0
  let depth = 0
  let inString = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (char === "\"") {
      if (inString && text[index + 1] === "\"") {
        index += 1
        continue
      }
      inString = !inString
      continue
    }

    if (inString) continue
    if (char === "(") {
      depth += 1
      continue
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1)
      continue
    }
    if (depth === 0 && char === delimiter) {
      result.push(text.slice(start, index))
      start = index + 1
    }
  }

  result.push(text.slice(start))
  return result
}

const setBlockFieldsFromLine = (block: Blockly.Block, line: BasicVisualLine): void => {
  setBlockMetadata(block, {
    legacyLineNumber: line.legacyLineNumber,
  })

  const fields = STATEMENT_FIELD_KEYS[line.statement.kind]
  for (const fieldName of fields) {
    const blockFieldName = toBlockFieldName(line.statement.kind, fieldName)
    const rawValue = line.statement.fields[fieldName] ?? ""
    const value =
      fieldName === "line" &&
      (line.statement.kind === "goto" || line.statement.kind === "gosub")
        ? normalizeJumpTarget(rawValue) || "1"
        : rawValue
    if (block.getField(blockFieldName)) {
      block.setFieldValue(value, blockFieldName)
    }
  }
}

const createStatementBlockFromLine = (
  workspace: Blockly.WorkspaceSvg,
  line: BasicVisualLine
): Blockly.Block => {
  const blockType =
    BLOCK_TYPE_BY_KIND[line.statement.kind] ?? BLOCK_TYPE_BY_KIND.raw
  const block = workspace.newBlock(blockType)
  setBlockFieldsFromLine(block, line)
  block.initSvg()
  block.render()
  return block
}

const readVisualLineFromBlock = (block: Blockly.Block): BasicVisualLine | null => {
  const kind = KIND_BY_BLOCK_TYPE[block.type]
  if (!kind) return null

  const fields = Object.fromEntries(
    STATEMENT_FIELD_KEYS[kind].map((fieldName) => {
      const blockFieldName = toBlockFieldName(kind, fieldName)
      const value = block.getFieldValue(blockFieldName)
      const text = typeof value === "string" ? value : ""
      if (
        fieldName === "line" &&
        (kind === "goto" || kind === "gosub")
      ) {
        return [fieldName, normalizeJumpTarget(text)]
      }
      return [fieldName, text]
    })
  )

  const metadata = parseBlockMetadata(block)

  const statement: BasicVisualStatement = { kind, fields }

  return {
    legacyLineNumber: metadata.legacyLineNumber ?? "",
    statement,
  }
}

const parseInlineStatementToNode = (statement: string): WorkspaceVisualNode[] =>
  buildWorkspaceNodes(
    splitTopLevelInline(statement, ":")
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map((part) => ({
        legacyLineNumber: "",
        statement: parseBasicStatementToVisual(part),
      }))
  )

const buildNodeFromLine = (line: BasicVisualLine): WorkspaceVisualNode => {
  if (line.statement.kind !== "if") {
    return { line }
  }

  return {
    line: {
      ...line,
      statement: {
        ...line.statement,
        fields: {
          condition: line.statement.fields.condition ?? "",
        },
      },
    },
    ifThen: parseInlineStatementToNode(line.statement.fields.then ?? ""),
    ifElse: parseInlineStatementToNode(line.statement.fields.else ?? ""),
  }
}

const findMatchingNextIndex = (
  lines: BasicVisualLine[],
  start: number,
  end: number,
  forVariable: string
): number => {
  let depth = 0
  const normalizedForVariable = normalizeVariableName(forVariable)

  for (let index = start; index < end; index += 1) {
    const current = lines[index]

    if (current.statement.kind === "for") {
      depth += 1
      continue
    }

    if (current.statement.kind !== "next") {
      continue
    }

    if (depth > 0) {
      depth -= 1
      continue
    }

    const normalizedNextVariable = normalizeVariableName(
      current.statement.fields.variable ?? ""
    )
    if (
      !normalizedNextVariable ||
      !normalizedForVariable ||
      normalizedNextVariable === normalizedForVariable
    ) {
      return index
    }
  }

  return -1
}

const buildWorkspaceNodes = (lines: BasicVisualLine[]): WorkspaceVisualNode[] => {
  const nodes: WorkspaceVisualNode[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]

    if (line.statement.kind !== "for") {
      nodes.push(buildNodeFromLine(line))
      continue
    }

    const matchIndex = findMatchingNextIndex(
      lines,
      index + 1,
      lines.length,
      line.statement.fields.variable ?? ""
    )

    if (matchIndex < 0) {
      nodes.push({ line })
      continue
    }

    const nextLine = lines[matchIndex]
    nodes.push({
      line,
      forBody: buildWorkspaceNodes(lines.slice(index + 1, matchIndex)),
      forNextVariable: nextLine.statement.fields.variable ?? "",
      forNextLegacyLineNumber: nextLine.legacyLineNumber,
    })

    index = matchIndex
  }

  return nodes
}

const connectStatementChain = (
  parent: Blockly.Connection | null,
  child: Blockly.Block | null
): void => {
  if (!parent || !child?.previousConnection) return
  parent.connect(child.previousConnection)
}

const buildBlockChain = (
  workspace: Blockly.WorkspaceSvg,
  nodes: WorkspaceVisualNode[]
): { first: Blockly.Block; last: Blockly.Block } | null => {
  let first: Blockly.Block | null = null
  let previous: Blockly.Block | null = null

  for (const node of nodes) {
    const block = createStatementBlockFromNode(workspace, node)

    if (!first) {
      first = block
    }

    if (previous?.nextConnection && block.previousConnection) {
      previous.nextConnection.connect(block.previousConnection)
    }

    previous = block
  }

  if (!first || !previous) {
    return null
  }

  return { first, last: previous }
}

const createStatementBlockFromNode = (
  workspace: Blockly.WorkspaceSvg,
  node: WorkspaceVisualNode
): Blockly.Block => {
  const block = createStatementBlockFromLine(workspace, node.line)

  if (node.line.statement.kind === "for") {
    setBlockMetadata(block, {
      forNextVariable: node.forNextVariable ?? "",
      forNextLegacyLineNumber: node.forNextLegacyLineNumber ?? "",
    })

    const bodyChain = buildBlockChain(workspace, node.forBody ?? [])
    connectStatementChain(block.getInput("BODY")?.connection ?? null, bodyChain?.first ?? null)
  }

  if (node.line.statement.kind === "if") {
    const thenChain = buildBlockChain(workspace, node.ifThen ?? [])
    connectStatementChain(
      block.getInput("THEN_BODY")?.connection ?? null,
      thenChain?.first ?? null
    )

    const elseChain = buildBlockChain(workspace, node.ifElse ?? [])
    connectStatementChain(
      block.getInput("ELSE_BODY")?.connection ?? null,
      elseChain?.first ?? null
    )
  }

  return block
}

const collectBlockAndNested = (block: Blockly.Block, ordered: Blockly.Block[]) => {
  ordered.push(block)

  if (block.type === FOR_BLOCK_TYPE) {
    const body = block.getInputTargetBlock("BODY")
    collectBlockChain(body, ordered)
    return
  }

  if (block.type === IF_BLOCK_TYPE) {
    const thenBody = block.getInputTargetBlock("THEN_BODY")
    const elseBody = block.getInputTargetBlock("ELSE_BODY")
    collectBlockChain(thenBody, ordered)
    collectBlockChain(elseBody, ordered)
  }
}

const collectBlockChain = (
  startBlock: Blockly.Block | null,
  ordered: Blockly.Block[]
) => {
  let block = startBlock
  while (block) {
    collectBlockAndNested(block, ordered)
    block = block.getNextBlock()
  }
}

const getDetachedRootBlocks = (
  workspace: Blockly.WorkspaceSvg,
  scriptEntry: Blockly.Block
): Blockly.Block[] =>
  workspace
    .getTopBlocks(true)
    .filter(
      (root) => root.id !== scriptEntry.id && isStatementVisualBlock(root)
    )

const getActiveVisualBlocks = (
  workspace: Blockly.WorkspaceSvg
): Blockly.Block[] => {
  const scriptEntry = ensureScriptEntryBlock(workspace)
  const ordered: Blockly.Block[] = []
  collectBlockChain(scriptEntry.getNextBlock(), ordered)
  return ordered
}

const getDetachedVisualBlocks = (
  workspace: Blockly.WorkspaceSvg
): Blockly.Block[] => {
  const scriptEntry = ensureScriptEntryBlock(workspace)
  const ordered: Blockly.Block[] = []
  const roots = getDetachedRootBlocks(workspace, scriptEntry)

  for (const root of roots) {
    collectBlockChain(root, ordered)
  }

  return ordered
}

const formatLineIndexLabel = (lineNumber: number, width: number): string =>
  lineNumber.toString().padStart(width, "0")

export const updateVisualLineNumberLabels = (
  workspace: Blockly.WorkspaceSvg
): void => {
  const activeBlocks = getActiveVisualBlocks(workspace)
  const lineNumberWidth = Math.max(1, activeBlocks.length.toString().length)

  for (let index = 0; index < activeBlocks.length; index += 1) {
    const block = activeBlocks[index]
    if (!block.getField("LINE_INDEX")) continue

    const nextValue = formatLineIndexLabel(index + 1, lineNumberWidth)
    if (block.getFieldValue("LINE_INDEX") !== nextValue) {
      block.setFieldValue(nextValue, "LINE_INDEX")
    }
  }

  for (const block of getDetachedVisualBlocks(workspace)) {
    if (!block.getField("LINE_INDEX")) continue
    if (block.getFieldValue("LINE_INDEX") !== "") {
      block.setFieldValue("", "LINE_INDEX")
    }
  }
}

export const findVisualBlockByLineNumber = (
  workspace: Blockly.WorkspaceSvg,
  targetLineNumber: number
): Blockly.Block | null => {
  if (!Number.isInteger(targetLineNumber) || targetLineNumber <= 0) {
    return null
  }

  const activeBlocks = getActiveVisualBlocks(workspace)
  const byVisualIndex = activeBlocks[targetLineNumber - 1]
  if (byVisualIndex) {
    return byVisualIndex
  }

  for (const block of activeBlocks) {
    const metadata = parseBlockMetadata(block)
    const legacy = Number.parseInt(metadata.legacyLineNumber ?? "", 10)
    if (legacy === targetLineNumber) {
      return block
    }

    const nextLegacy = Number.parseInt(metadata.forNextLegacyLineNumber ?? "", 10)
    if (nextLegacy === targetLineNumber) {
      return block
    }
  }

  return null
}

const readInlineStatementsFromInput = (
  block: Blockly.Block,
  inputName: string
): string => {
  const first = block.getInputTargetBlock(inputName)
  if (!first) return ""

  const lines = readLinesFromBlockChain(first)
  return lines
    .map((line) => emitBasicStatementFromVisual(line.statement).trim())
    .filter((statement) => statement.length > 0)
    .join(" : ")
}

const readLinesFromBlock = (block: Blockly.Block): BasicVisualLine[] => {
  const line = readVisualLineFromBlock(block)
  if (!line) return []

  if (line.statement.kind === "for") {
    const metadata = parseBlockMetadata(block)
    const bodyLines = readLinesFromBlockChain(block.getInputTargetBlock("BODY"))
    const nextVariable = (metadata.forNextVariable ?? "").trim()

    const nextLine: BasicVisualLine = {
      legacyLineNumber: metadata.forNextLegacyLineNumber ?? "",
      statement: {
        kind: "next",
        fields: nextVariable ? { variable: nextVariable } : {},
      },
    }

    return [line, ...bodyLines, nextLine]
  }

  if (line.statement.kind === "if") {
    return [
      {
        ...line,
        statement: {
          ...line.statement,
          fields: {
            ...line.statement.fields,
            then: readInlineStatementsFromInput(block, "THEN_BODY"),
            else: readInlineStatementsFromInput(block, "ELSE_BODY"),
          },
        },
      },
    ]
  }

  return [line]
}

const readLinesFromBlockChain = (
  startBlock: Blockly.Block | null
): BasicVisualLine[] => {
  const lines: BasicVisualLine[] = []
  let block = startBlock

  while (block) {
    lines.push(...readLinesFromBlock(block))
    block = block.getNextBlock()
  }

  return lines
}

export const readVisualLinesFromWorkspace = (
  workspace: Blockly.WorkspaceSvg
): BasicVisualLine[] => {
  const scriptEntry = ensureScriptEntryBlock(workspace)
  const activeLines = readLinesFromBlockChain(scriptEntry.getNextBlock())
  const detachedLines: BasicVisualLine[] = []

  const detachedRoots = getDetachedRootBlocks(workspace, scriptEntry)
  for (const root of detachedRoots) {
    detachedLines.push(...readLinesFromBlockChain(root))
  }

  return [...activeLines, ...detachedLines.map(encodeDetachedCommentLine)]
}

const findTailBlock = (root: Blockly.Block): Blockly.Block => {
  let tail = root
  let next = tail.getNextBlock()

  while (next) {
    tail = next
    next = tail.getNextBlock()
  }

  return tail
}

export const loadVisualLinesIntoWorkspace = (
  workspace: Blockly.WorkspaceSvg,
  lines: BasicVisualLine[]
): void => {
  workspace.clear()
  const scriptEntry = ensureScriptEntryBlock(workspace)

  const activeLines: BasicVisualLine[] = []
  const detachedLines: BasicVisualLine[] = []

  for (const line of lines) {
    const detachedLine = parseDetachedCommentLine(line)
    if (detachedLine) {
      detachedLines.push(detachedLine)
      continue
    }
    activeLines.push(line)
  }

  const activeNodes = buildWorkspaceNodes(activeLines)
  const activeChain = buildBlockChain(workspace, activeNodes)
  connectStatementChain(
    scriptEntry.nextConnection ?? null,
    activeChain?.first ?? null
  )

  const detachedNodes = buildWorkspaceNodes(detachedLines)
  const detachedChain = buildBlockChain(workspace, detachedNodes)
  if (detachedChain?.first) {
    detachedChain.first.moveBy(420, 32)
  }

  updateVisualLineNumberLabels(workspace)
  workspace.render()
}

export const appendVisualLineToWorkspace = (
  workspace: Blockly.WorkspaceSvg,
  line: BasicVisualLine
): void => {
  const scriptEntry = ensureScriptEntryBlock(workspace)
  const node = buildNodeFromLine(line)
  const chain = buildBlockChain(workspace, [node])
  if (!chain) return

  const activeRoot = scriptEntry.getNextBlock()
  if (!activeRoot) {
    connectStatementChain(
      scriptEntry.nextConnection ?? null,
      chain.first
    )
    updateVisualLineNumberLabels(workspace)
    workspace.render()
    return
  }

  const tail = findTailBlock(activeRoot)
  if (tail.nextConnection && chain.first.previousConnection) {
    tail.nextConnection.connect(chain.first.previousConnection)
  } else {
    chain.first.moveBy(420, 32)
  }

  updateVisualLineNumberLabels(workspace)
  workspace.render()
}

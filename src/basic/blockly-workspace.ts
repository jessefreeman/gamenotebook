import * as Blockly from "blockly/core"
import type {
  BasicVisualLine,
  BasicVisualStatement,
  BasicVisualStatementKind,
} from "./blockly-model"

type BlocklyBlockDefinition = {
  type: string
  message0: string
  args0?: unknown[]
  previousStatement: null
  nextStatement: null
  colour: number
  tooltip?: string
}

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
  if: "basic_stmt_if",
  goto: "basic_stmt_goto",
  gosub: "basic_stmt_gosub",
  return: "basic_stmt_return",
  for: "basic_stmt_for",
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
  if: ["condition", "then", "else"],
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
        text: "\"HELLO\"",
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
    type: "basic_stmt_if",
    message0: "IF %1 THEN %2 ELSE %3",
    args0: [
      {
        type: "field_input",
        name: "CONDITION",
        text: "A=1",
      },
      {
        type: "field_input",
        name: "THEN",
        text: "PRINT \"YES\"",
      },
      {
        type: "field_input",
        name: "ELSE",
        text: "",
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 40,
  },
  {
    type: "basic_stmt_goto",
    message0: "GOTO %1",
    args0: [
      {
        type: "field_input",
        name: "TARGET",
        text: "10",
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 40,
  },
  {
    type: "basic_stmt_gosub",
    message0: "GOSUB %1",
    args0: [
      {
        type: "field_input",
        name: "TARGET",
        text: "100",
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
    type: "basic_stmt_for",
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

const withLineNumberField = (
  definition: BlocklyBlockDefinition
): BlocklyBlockDefinition => {
  const shiftedMessage = definition.message0.replace(/%(\d+)/g, (_match, raw) => {
    const index = Number.parseInt(raw, 10)
    if (!Number.isInteger(index) || index < 1) {
      return _match
    }
    return `%${index + 2}`
  })

  return {
    ...definition,
    message0: `line %1 # %2 ${shiftedMessage}`,
    args0: [
      {
        type: "field_label_serializable",
        name: "LINE_INDEX",
        text: "1",
      },
      {
        type: "field_input",
        name: "LINE",
        text: "",
      },
      ...(definition.args0 ?? []),
    ],
  }
}

const BASIC_BLOCK_DEFINITIONS = STATEMENT_BLOCK_DEFINITIONS.map(withLineNumberField)

let blocksRegistered = false

export const ensureBasicBlocklyBlocks = (): void => {
  if (blocksRegistered || Blockly.Blocks["basic_stmt_rem"]) {
    blocksRegistered = true
    return
  }

  Blockly.defineBlocksWithJsonArray(BASIC_BLOCK_DEFINITIONS)
  blocksRegistered = true
}

const getOrderedVisualBlocks = (
  workspace: Blockly.WorkspaceSvg
): Blockly.Block[] => {
  const ordered: Blockly.Block[] = []
  const rootBlocks = workspace.getTopBlocks(true)

  for (const rootBlock of rootBlocks) {
    let block: Blockly.Block | null = rootBlock
    while (block) {
      ordered.push(block)
      block = block.getNextBlock()
    }
  }

  return ordered
}

export const updateVisualLineNumberLabels = (
  workspace: Blockly.WorkspaceSvg
): void => {
  const orderedBlocks = getOrderedVisualBlocks(workspace)
  for (let index = 0; index < orderedBlocks.length; index += 1) {
    const block = orderedBlocks[index]
    if (!block.getField("LINE_INDEX")) continue

    const lineValue = (index + 1).toString()
    if (block.getFieldValue("LINE_INDEX") !== lineValue) {
      block.setFieldValue(lineValue, "LINE_INDEX")
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

  const orderedBlocks = getOrderedVisualBlocks(workspace)
  const byIndex = orderedBlocks[targetLineNumber - 1]
  if (byIndex) {
    return byIndex
  }

  for (const block of orderedBlocks) {
    const lineValue = block.getFieldValue("LINE")
    const legacyLine = Number.parseInt(
      typeof lineValue === "string" ? lineValue : "",
      10
    )
    if (legacyLine === targetLineNumber) {
      return block
    }
  }

  return null
}

const setBlockFieldsFromLine = (block: Blockly.Block, line: BasicVisualLine): void => {
  if (block.getField("LINE")) {
    block.setFieldValue(line.legacyLineNumber, "LINE")
  }

  const fields = STATEMENT_FIELD_KEYS[line.statement.kind]
  for (const fieldName of fields) {
    const blockFieldName = toBlockFieldName(line.statement.kind, fieldName)
    const value = line.statement.fields[fieldName] ?? ""
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
      return [fieldName, typeof value === "string" ? value : ""]
    })
  )

  const lineValue = block.getFieldValue("LINE")
  const legacyLineNumber =
    typeof lineValue === "string" ? lineValue.trim() : ""

  const statement: BasicVisualStatement = { kind, fields }

  return {
    legacyLineNumber,
    statement,
  }
}

export const readVisualLinesFromWorkspace = (
  workspace: Blockly.WorkspaceSvg
): BasicVisualLine[] => {
  const lines: BasicVisualLine[] = []
  const orderedBlocks = getOrderedVisualBlocks(workspace)

  for (const block of orderedBlocks) {
    const line = readVisualLineFromBlock(block)
    if (line) {
      lines.push(line)
    }
  }

  return lines
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

  let previousBlock: Blockly.Block | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const block = createStatementBlockFromLine(workspace, lines[index])

    if (!previousBlock) {
      block.moveBy(32, 32 + index * 64)
    } else {
      const parentConnection = previousBlock.nextConnection
      const childConnection = block.previousConnection
      if (parentConnection && childConnection) {
        parentConnection.connect(childConnection)
      }
    }

    previousBlock = block
  }

  updateVisualLineNumberLabels(workspace)
  workspace.render()
}

export const appendVisualLineToWorkspace = (
  workspace: Blockly.WorkspaceSvg,
  line: BasicVisualLine
): void => {
  const newBlock = createStatementBlockFromLine(workspace, line)
  const rootBlocks = workspace
    .getTopBlocks(true)
    .filter((block) => block.id !== newBlock.id)

  if (rootBlocks.length === 0) {
    newBlock.moveBy(32, 32)
    workspace.render()
    return
  }

  const anchorRoot = rootBlocks[rootBlocks.length - 1]
  const tail = findTailBlock(anchorRoot)
  const parentConnection = tail.nextConnection
  const childConnection = newBlock.previousConnection

  if (parentConnection && childConnection) {
    parentConnection.connect(childConnection)
  } else {
    newBlock.moveBy(32, 32 + rootBlocks.length * 64)
  }

  updateVisualLineNumberLabels(workspace)
  workspace.render()
}

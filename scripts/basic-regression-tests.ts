import { readFileSync } from "fs"
import { join } from "path"
import {
  runAndAssertBasicScenario,
  type BasicExpectation,
  type BasicHarnessScenario,
} from "../src/basic/test-harness"
import {
  emitBasicSourceFromVisualLines,
  parseBasicSourceToVisualLines,
} from "../src/basic/blockly-model"

type BasicRegressionCase = {
  name: string
  scenario: BasicHarnessScenario
  expectation: BasicExpectation
  debugRows?: number
}

const readGame = (id: string): string => {
  const filePath = join(process.cwd(), "games", id)
  return readFileSync(filePath, "utf8")
}

const makeLoopsExpectation = (): BasicExpectation => {
  const cells: { col: number; row: number; equals: string }[] = []

  for (let x = 0; x <= 31; x += 1) {
    cells.push({ col: x, row: 0, equals: "-" })
    cells.push({ col: x, row: 29, equals: "-" })
  }

  for (let y = 1; y <= 28; y += 1) {
    cells.push({ col: 0, row: y, equals: "|" })
    cells.push({ col: 31, row: y, equals: "|" })
  }

  for (let y = 2; y <= 27; y += 5) {
    for (let x = 2; x <= 27; x += 5) {
      cells.push({ col: x, row: y, equals: "*" })
    }
  }

  // Guard spots that should remain empty to catch accidental diagonals/scroll artifacts.
  cells.push({ col: 4, row: 4, equals: " " })
  cells.push({ col: 10, row: 10, equals: " " })
  cells.push({ col: 20, row: 20, equals: " " })

  return {
    error: null,
    cells,
  }
}

const cases: BasicRegressionCase[] = [
  {
    name: "Input Echo computes numeric expressions from INPUT",
    scenario: {
      source: readGame("basic_input"),
      inputs: ["ADA", "6"],
    },
    expectation: {
      error: null,
      rows: [
        { row: 0, startsWith: "HELLO ADA" },
        { row: 1, startsWith: "DOUBLE = 12" },
        { row: 2, startsWith: "SQUARE = 36" },
      ],
      variables: {
        "N$": "ADA",
        X: 6,
      },
    },
    debugRows: 6,
  },
  {
    name: "Loops + Grid draws full border and star grid without diagonal artifacts",
    scenario: {
      source: `CLS
COLOR 6,0
FOR X=0 TO 31
LOCATE X,0
PRINT "-";
LOCATE X,29
PRINT "-";
NEXT X
FOR Y=1 TO 28
LOCATE 0,Y
PRINT "|";
LOCATE 31,Y
PRINT "|";
NEXT Y
COLOR 14,0
FOR Y=2 TO 27 STEP 5
FOR X=2 TO 27 STEP 5
LOCATE X,Y
PRINT "*";
NEXT X
NEXT Y
END`,
    },
    expectation: makeLoopsExpectation(),
    debugRows: 10,
  },
  {
    name: "Inkey Control consumes key queue and exits on Q",
    scenario: {
      source: `CLS
X=15
Y=14
LOCATE 0,0
COLOR 15,0
PRINT "WASD MOVE, Q QUIT"
COLOR 7,0
LOCATE X,Y
PRINT "@";
OLDX=X
OLDY=Y
K$=INKEY$
IF K$="a" THEN X=X-1
IF K$="d" THEN X=X+1
IF K$="w" THEN Y=Y-1
IF K$="s" THEN Y=Y+1
IF K$="q" THEN END
IF X<0 THEN X=0
IF X>31 THEN X=31
IF Y<1 THEN Y=1
IF Y>29 THEN Y=29
IF X<>OLDX OR Y<>OLDY THEN LOCATE OLDX,OLDY
IF X<>OLDX OR Y<>OLDY THEN PRINT " ";
GOTO 8`,
      keys: ["d", "s", "q"],
    },
    expectation: {
      error: null,
      rows: [{ row: 0, startsWith: "WASD MOVE, Q QUIT" }],
      variables: {
        X: 16,
        Y: 15,
        "K$": "q",
      },
      cells: [{ col: 16, row: 15, equals: "@" }],
    },
    debugRows: 6,
  },
  {
    name: "Hello Key Wait exits polling loop and shows READY",
    scenario: {
      source: readGame("basic_hello"),
      keys: ["x"],
    },
    expectation: {
      error: null,
      rows: [{ row: 12, contains: "READY!" }],
      cells: [{ col: 12, row: 12, equals: "R" }],
      variables: {
        "K$": "x",
      },
    },
    debugRows: 16,
  },
  {
    name: "Arrays and DIM print square values",
    scenario: {
      source: `CLS
DIM N(8)
FOR I=0 TO 8
N(I)=I*I
NEXT I
FOR I=0 TO 8
PRINT "N(";I;")=";N(I)
NEXT I
END`,
    },
    expectation: {
      error: null,
      rows: [
        { row: 0, startsWith: "N(0)=0" },
        { row: 8, startsWith: "N(8)=64" },
      ],
      variables: {
        I: 9,
      },
    },
    debugRows: 12,
  },
  {
    name: "GOSUB and RETURN call each subroutine in order",
    scenario: {
      source: `CLS
GOSUB 6
GOSUB 9
GOSUB 12
END
COLOR 12,0
PRINT "SUB A"
RETURN
COLOR 10,0
PRINT "SUB B"
RETURN
COLOR 8,0
PRINT "SUB C"
RETURN`,
    },
    expectation: {
      error: null,
      rows: [
        { row: 0, startsWith: "SUB A" },
        { row: 1, startsWith: "SUB B" },
        { row: 2, startsWith: "SUB C" },
      ],
    },
    debugRows: 8,
  },
  {
    name: "Palette loop writes all color rows and completion text",
    scenario: {
      source: readGame("basic_palette"),
    },
    expectation: {
      error: null,
      rows: [
        { row: 2, startsWith: "  COLOR 0" },
        { row: 17, startsWith: "  COLOR 15" },
        { row: 22, startsWith: "  PALETTE COMPLETE" },
      ],
      variables: {
        C: 16,
      },
    },
    debugRows: 24,
  },
  {
    name: "Shapes sample draws frame lines and label",
    scenario: {
      source: readGame("basic_shapes"),
    },
    expectation: {
      error: null,
      rows: [{ row: 27, contains: "RECT + LINE + COLOR TEST" }],
      pixels: [
        { x: 20, y: 20, equals: 10 },
        { x: 236, y: 200, equals: 10 },
        { x: 90, y: 70, equals: 13 },
      ],
    },
    debugRows: 30,
  },
  {
    name: "LET + comments + IF ELSE + STOP preserve control flow",
    scenario: {
      source: `10 REM START
20 LET A=1
30 IF A=1 THEN 50 ELSE STOP
40 STOP
50 ' PASS
60 PRINT "LET OK"
70 END`,
    },
    expectation: {
      error: null,
      rows: [{ row: 0, startsWith: "LET OK" }],
      variables: {
        A: 1,
      },
    },
    debugRows: 8,
  },
  {
    name: "Runtime errors include source line context",
    scenario: {
      source: `PRINT "A"
GOTO 300
END`,
    },
    expectation: {
      error: /LINE 2: Unknown line number 300/,
    },
    debugRows: 4,
  },
  {
    name: "INPUT values normalize to uppercase",
    scenario: {
      source: `INPUT "NAME";N$
PRINT N$
END`,
      inputs: ["ada"],
    },
    expectation: {
      error: null,
      rows: [
        { row: 0, startsWith: "NAME ADA" },
        { row: 1, startsWith: "ADA" },
      ],
      variables: {
        "N$": "ADA",
      },
    },
    debugRows: 4,
  },
  {
    name: "PEEK and POKE roundtrip memory bytes",
    scenario: {
      source: `POKE 4096,65
PRINT CHR$(PEEK(4096))
END`,
    },
    expectation: {
      error: null,
      rows: [{ row: 0, startsWith: "A" }],
    },
    debugRows: 4,
  },
  {
    name: "PSET plots explicit pixel color",
    scenario: {
      source: `CLS
COLOR 15,0
PSET 100,100,12
PRINT "PSET OK"
END`,
    },
    expectation: {
      error: null,
      rows: [{ row: 0, startsWith: "PSET OK" }],
      pixels: [{ x: 100, y: 100, equals: 12 }],
    },
    debugRows: 6,
  },
  {
    name: "NEXT without variable uses latest FOR frame",
    scenario: {
      source: `CLS
FOR I=1 TO 3
PRINT I;
NEXT
END`,
    },
    expectation: {
      error: null,
      rows: [{ row: 0, startsWith: "123" }],
      variables: {
        I: 4,
      },
    },
    debugRows: 6,
  },
]

const printRowSnapshot = (rows: string[], maxRows: number): void => {
  const count = Math.min(maxRows, rows.length)
  for (let row = 0; row < count; row += 1) {
    const text = rows[row].replace(/\s+$/g, "")
    console.log(`    ${row.toString().padStart(2, "0")}: ${text}`)
  }
}

const main = async (): Promise<void> => {
  let failures = 0
  const allCases: BasicRegressionCase[] = [
    ...cases,
    ...cases.map((testCase) => ({
      ...testCase,
      name: `${testCase.name} [Visual roundtrip]`,
      scenario: {
        ...testCase.scenario,
        source: emitBasicSourceFromVisualLines(
          parseBasicSourceToVisualLines(testCase.scenario.source)
        ),
      },
    })),
  ]

  for (const testCase of allCases) {
    const { result, failures: assertionFailures } = await runAndAssertBasicScenario(
      testCase.scenario,
      testCase.expectation
    )

    if (assertionFailures.length === 0) {
      console.log(`PASS ${testCase.name}`)
      continue
    }

    failures += 1
    console.log(`FAIL ${testCase.name}`)
    for (const failure of assertionFailures) {
      console.log(
        `  - ${failure.path}: ${failure.message} (expected=${JSON.stringify(
          failure.expected
        )}, actual=${JSON.stringify(failure.actual)})`
      )
    }

    const rows = result.renderer.getRows(false)
    printRowSnapshot(rows, testCase.debugRows ?? 8)
  }

  if (failures > 0) {
    console.error(`\n${failures} regression case(s) failed.`)
    process.exitCode = 1
    return
  }

  console.log(`\nAll ${allCases.length} regression cases passed.`)
}

void main()

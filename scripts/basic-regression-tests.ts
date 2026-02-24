import { readFileSync } from "fs"
import { join } from "path"
import {
  runAndAssertBasicScenario,
  type BasicExpectation,
  type BasicHarnessScenario,
} from "../src/basic/test-harness"

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
      source: readGame("basic_loops"),
    },
    expectation: makeLoopsExpectation(),
    debugRows: 10,
  },
  {
    name: "Inkey Control consumes key queue and exits on Q",
    scenario: {
      source: readGame("basic_inkey"),
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

  for (const testCase of cases) {
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

  console.log(`\nAll ${cases.length} regression cases passed.`)
}

void main()

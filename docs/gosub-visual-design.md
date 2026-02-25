# GOSUB Visual Model Proposal

## Goal
Make subroutines visually explicit and nested, while preserving exact executable behavior when converting to/from raw BASIC.

## Proposed UX Model
1. Keep one top-level `SCRIPT` entry block for main flow.
2. Add a second top-level container block type: `SUB #<line>`.
3. `SUB #<line>` has a statement body input (`BODY`).
4. `GOSUB` remains a statement block that targets a subroutine line (`#line`).
5. `RETURN` stays inside subroutine bodies; if missing in visual mode, exporter appends one at emit time.

This makes subroutines visually separated from main flow and easy to scan.

## Blockly Block Types
1. `basic_script_entry` (already exists).
2. `basic_sub_entry` (new):
   - `message0: "SUB # %1"`
   - one editable field: `TARGET`
   - one statement input: `BODY`
   - no `previousStatement`, no `nextStatement` (top-level container)
3. Existing statement blocks unchanged (`GOSUB #`, `RETURN`, etc).

## Internal Workspace Model
Introduce explicit program sections:
1. `mainNodes`: chain connected to `SCRIPT`.
2. `subSections`: array of `{ line: string, nodes: WorkspaceVisualNode[] }` from each `SUB` block.
3. detached blocks remain commented-out as currently implemented.

## Source Emission Rules
Given `mainNodes + subSections`:
1. Emit `mainNodes` first.
2. Emit each `subSection` in ascending numeric line order (`#10`, `#20`, ...).
3. Emit sub header as a plain line label target by position semantics:
   - no dedicated BASIC keyword is emitted.
   - the first statement of the sub is placed on the target line index by physical ordering.
4. Ensure each sub body ends with `RETURN`:
   - if last emitted statement for the sub is not `RETURN`, append one.
5. Keep `GOSUB #n` and `GOTO #n` formatting.

Note: BASIC runtime already jumps by physical line index and supports `#` stripping.

## Source Parsing Rules (Code -> Visual)
When loading flat BASIC source:
1. Parse to `BasicVisualLine[]` as today.
2. Detect candidate subroutine starts from `GOSUB #n` targets in active code.
3. Build section boundaries:
   - `main` starts at line 1.
   - each target `n` creates/extends a `subSection` beginning at line `n`.
   - section ends at first `RETURN` that closes the active sub, or before next section start.
4. Lines not belonging to any detected sub remain in `main`.
5. Convert each detected sub to a `SUB #n` block with nested body nodes.

Fallback behavior:
1. If overlapping/ambiguous targets occur, keep ambiguous lines in `main` and add a warning comment block in visual mode.
2. If a `GOSUB #n` target is out of range, keep block as-is and do not create empty sub container.

## Roundtrip Guarantees
1. Visual -> Code -> Visual preserves:
   - subroutine container structure
   - statement order inside each container
   - jump targets (`#n`)
2. Detached blocks stay detached via comment encoding (current behavior).
3. Existing flat scripts without explicit sub containers still load and execute.

## Validation Plan
Add regression cases:
1. `GOSUB` with 3 subroutines (current sample) roundtrips to same behavior.
2. Missing `RETURN` in sub body auto-appends on emit.
3. Nested `IF`/`FOR` inside a sub body preserves structure.
4. `GOSUB #n` to undefined line remains valid text and surfaces warning block.
5. Multiple `GOSUB` calls to same sub line use one container.

## Implementation Order
1. Add `basic_sub_entry` block definition and workspace collect/load helpers.
2. Extend workspace read/write API to return `{ main, subs, detached }` sections internally.
3. Add parser grouping from flat lines into `main + subs`.
4. Update emitter to serialize `main` then `subs` with `RETURN` enforcement.
5. Add tests for parse/emit/runtime parity.

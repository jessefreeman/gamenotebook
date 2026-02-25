# GameNotebook

GameNotebook is a local-first code snippet/notepad app built with Tauri and Solid.js.
> Note: GameNotebook is derived from the original Dropcode project.

## BASIC Lab MVP

The app now includes BASIC runtime support in the existing two-pane snippets layout:

1. Open your BASIC file/snippet in the normal left-file-list + right-editor UI.
2. Click the `Play` button in the snippet header.
3. A separate runner window opens and executes the current snippet source.
4. The runner window is canvas-only (no UI chrome) and scales the 256x240 output to fit the window.

### Current BASIC Commands

`LET`, assignment (`A=1`), `PRINT`, `INPUT`, `IF ... THEN ... ELSE`, `GOTO`, `GOSUB`, `RETURN`, `FOR ... NEXT`, `DIM`, `CLS`, `COLOR`, `LOCATE`, `PSET`, `LINE`, `RECT`, `END`, `STOP`.

`GOTO`/`GOSUB`/numeric `THEN` targets use the editor's visible 1-based line numbers.

### Font Mapping Contract

`large.font.png` is treated as an 8x8 glyph atlas scanned from top-left to bottom-right.

1. First glyph maps to ASCII DEC `32` (space)
2. Then sequentially through supported printable codes (`32-126`, `161-172`, `174-255`)
3. Unsupported control ranges are skipped by design

### Runner Behavior

1. Runner windows use Tauri window label `basic-runner`.
2. Pressing `Play` updates the active runner with the latest snippet source.
3. Runner window title matches the snippet/file name.
4. `INPUT` in BASIC uses an in-runner input overlay (no native prompt dependency).

### BASIC Regression Harness

Run interpreter regressions:

```bash
pnpm test:basic
```

Where to extend it:

1. Harness/API: `src/basic/test-harness.ts`
2. Regression suite: `scripts/basic-regression-tests.ts`

## Local Development (GameNotebook)

### Prerequisites

1. Node.js (18+ recommended)
2. Rust toolchain
3. Xcode Command Line Tools (`xcode-select --install`)

### Install Dependencies

```bash
npx -y pnpm@7 install --frozen-lockfile
```

### Live Reload Desktop Development

```bash
npx -y pnpm@7 tauri dev
```

Or use the script:

```bash
pnpm dev:live
```

This runs the frontend dev server plus Tauri desktop shell with live reload, so you can iterate without packaged rebuilds.

Compatibility alias:

```bash
pnpm dev:tauri
```

How this behaves:

1. Keep `pnpm dev:live` running in one terminal.
2. Edit files under `src/` and the app window reloads automatically.
3. Only run `pnpm build:mac:app` when you need a distributable `.app` artifact.

If `1420` is already in use, stop the existing dev server/instance first, then rerun `pnpm dev:live`.

### Versioned macOS `.app` Build (No zip/dmg)

```bash
pnpm build:mac:app
```

Output layout:

1. `artifacts/macos/builds/<build-id>/GameNotebook.app`
2. `artifacts/macos/LATEST_BUILD_ID.txt`
3. `artifacts/macos/LATEST_APP_PATH.txt`

Open the latest build:

```bash
open "$(cat artifacts/macos/LATEST_APP_PATH.txt)"
```

### Why `CARGO_TARGET_DIR` is Set

This workspace path contains spaces (`/Volumes/My Shared Files/...`). The build script sets `CARGO_TARGET_DIR` to `/tmp/...` so Cargo/Tauri outputs are written to a clean path and app packaging remains reliable.

## License

GameNotebook is licensed under the MIT license. See [LICENSE](LICENSE) for details.

# Building GameNotebook Locally and in GitHub Actions: Architecture and Hardening Notes

## Why We Reworked the Build System

The old release pipeline was tightly coupled to GitHub Actions. Packaging logic lived in workflow YAML, while local development used a different path. That split created drift and made failures hard to reproduce.

The goal of this redesign was:

1. One build path for local and CI.
2. Predictable per-platform outputs.
3. A CI workflow that sets up environment, runs local scripts, and publishes artifacts.
4. Better failure behavior: release publication should still happen with partial artifacts when possible.

## High-Level Architecture

The build system now follows a local-first architecture:

1. `scripts/build-release-artifacts.cjs` is the source of truth for packaging.
2. `package.json` scripts expose simple local commands.
3. GitHub Actions runs those same commands in a matrix (`macos`, `windows`, `linux`).
4. Artifacts are normalized into `release-files/` and uploaded.
5. Release publication attaches all available artifacts to the tag release.

Core files:

1. `scripts/build-release-artifacts.cjs`
2. `scripts/sync-version-from-tag.cjs`
3. `.github/workflows/tag-release-builds.yml`
4. `scripts/check-tag-release-workflow.cjs`
5. `package.json`

## Local Build Commands

Use these commands on your own machine:

1. Live reload desktop debug:

```bash
pnpm dev:live
```

2. Build release artifacts for the current host OS:

```bash
pnpm build:release
```

3. Build for specific platforms (run on matching host unless you explicitly support cross-builds):

```bash
pnpm build:release:macos
pnpm build:release:windows
pnpm build:release:linux
```

4. Check output:

```bash
ls -la release-files
```

## Platform Packaging Strategy

### macOS

1. Build `.app` bundle via Tauri.
2. Ad-hoc sign the app bundle.
3. Stage `GameNotebook.app` into a temporary DMG source folder.
4. Add an `Applications` symlink for drag-and-drop install.
5. Create the final DMG from that staged folder.

Expected output:

1. `release-files/GameNotebook_<version>_macos.dmg`

### Windows

1. Build MSI installer bundle (`msi`).
2. Copy standalone release executable from `target/release`.
3. Normalize names into `release-files/`.

Expected outputs:

1. `release-files/GameNotebook_<version>_windows_installer.msi`
2. `release-files/GameNotebook_<version>_windows_standalone.exe`

Note: `nsis` was removed because the installed Tauri version in this project reports it as unsupported.

### Linux

1. Build common Linux bundle formats (`appimage`, `deb`).
2. Collect any generated Linux packages (`.AppImage`, `.deb`, `.rpm`).

Expected output pattern:

1. `release-files/GameNotebook_<version>_linux.*`

## GitHub Actions Workflow Design

The release workflow now has three clear phases:

### Preflight phase

1. Validate tag format (`v<major>.<minor>.<patch>`).
2. Ensure tag commit is on `main`.
3. Sync `package.json` and `src-tauri/tauri.conf.json` versions from the tag.
4. Run workflow invariant checks.

### Build phase (matrix by OS)

1. Sync `package.json` and `src-tauri/tauri.conf.json` versions from the tag.
2. Setup `pnpm`, Node, Rust, and Linux system deps.
3. Run `pnpm build:release -- --platform <os>`.
4. Upload `release-files/*` as artifacts.

### Release phase

1. Runs with `if: always() && needs.preflight.result == 'success'`.
2. Downloads all available artifacts.
3. Publishes/updates GitHub Release for the tag.
4. Uses `fail_on_unmatched_files: false` so partial artifact sets still publish.

## Problems We Hit and How We Fixed Them

### 1) Network-coupled frontend build command in packaging

Problem:

1. Tauri `beforeBuildCommand` used `npx -y pnpm@7 build`.
2. In constrained environments that can fail due to npm network resolution.

Fix:

1. Generated CI config now overrides to `pnpm build`.
2. Packaging no longer depends on runtime `npx` bootstrap.

### 2) Fragile build outputs due to workspace path with spaces

Problem:

1. Path layout with spaces can cause unstable build behavior for Rust/Tauri artifacts.

Fix:

1. Release script sets `CARGO_TARGET_DIR` to a temp path.
2. This isolates build outputs from workspace path complexity.

### 3) Clang module cache permission issues in sandboxed runs

Problem:

1. Clang module cache default location was not writable in some runs.

Fix:

1. Script sets `CLANG_MODULE_CACHE_PATH` inside the temp build directory.

### 4) Windows command spawn instability (`status=null`)

Problem:

1. Process invocation for `pnpm` in Windows could fail before command execution.

Fix:

1. Windows execution now uses shell-backed spawn behavior.
2. Error reporting includes spawn errors and signal/exit details.

### 5) Unsupported Windows bundle format in current Tauri version

Problem:

1. `--bundles msi,nsis` fails with `Unsupported bundle format: nsis`.

Fix:

1. Windows bundle target changed to `msi` only.
2. Standalone `.exe` still produced from release binary output.

### 6) Release publication skipped when one matrix leg failed

Problem:

1. GitHub `release` job was blocked by matrix failure.

Fix:

1. Release job now runs after preflight even when a platform fails.
2. It publishes whatever artifacts exist successfully.

### 7) Tauri mutating Cargo files during packaging runs

Problem:

1. `Cargo.toml` / `Cargo.lock` could be altered during packaging.

Fix:

1. Script snapshots these files before build and restores them in `finally`.
2. Release runs are reproducible and do not dirty the git tree unexpectedly.

### 8) Manual JSON version bumps causing tag workflow failures

Problem:

1. Release tags could fail preflight when JSON versions were not manually updated first.
2. Manual version editing before every tag was unnecessary work and error-prone.

Fix:

1. Added `scripts/sync-version-from-tag.cjs`.
2. Workflow now syncs `package.json` and `src-tauri/tauri.conf.json` from `GITHUB_REF_NAME` during preflight and build jobs.

## Guardrails and Drift Prevention

`scripts/check-tag-release-workflow.cjs` enforces invariants so workflow and local commands do not drift:

1. Tag trigger format and preflight checks.
2. Build job calling local release command.
3. Release job partial-publish behavior.
4. Required `package.json` script wiring.

This check runs both locally and in CI guardrail workflow.

## Final Outcome

The hardened system now provides:

1. A single local/CI packaging path.
2. Reliable debug path (`pnpm dev:live`).
3. Deterministic release artifact naming.
4. Better cross-platform resilience.
5. A release step that publishes available artifacts even when one platform build fails.

The net result is a build process that is easier to test locally, easier to reason about in CI, and less fragile under real-world runner constraints.

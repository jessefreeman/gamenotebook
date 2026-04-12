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
3. Run release packaging commands only when you need installable artifacts.

If `1420` is already in use, stop the existing dev server/instance first, then rerun `pnpm dev:live`.

### Release Builds (Local-First)

Quick local workflow:

1. Run live-reload desktop dev:

```bash
pnpm dev:live
```

2. In a second terminal, run a release package build for your current OS:

```bash
pnpm build:release
```

3. Verify generated artifacts:

```bash
ls -la release-files
```

Manual platform commands (run on matching host OS):

```bash
pnpm build:release:macos
pnpm build:release:windows
pnpm build:release:linux
```

These platform-specific commands are intended to run on that same OS (or with explicit cross-build tooling and `ALLOW_CROSS_PLATFORM=1`).

Output layout:

1. `release-files/GameNotebook_<version>_macos.dmg` (includes `Applications` symlink for drag-to-install)
2. `release-files/GameNotebook_<version>_windows_standalone.exe`
3. `release-files/GameNotebook_<version>_windows_installer.msi`
4. `release-files/GameNotebook_<version>_linux.*` (`.AppImage`, `.deb`, or `.rpm` depending on host/tooling)

GitHub Actions uses the same local build command per OS (`pnpm build:release -- --platform <os>`), then uploads `release-files/*` to the tag release.
If one platform build fails, the workflow still publishes the release with whichever platform artifacts were produced successfully.
Tag builds automatically sync `package.json` and `src-tauri/tauri.conf.json` versions from the tag (for example, `v0.2.4` -> `0.2.4`) during the workflow, so manual version bumps are not required before tagging.

### Automated Release Tagging

Release helper commands:

1. `pnpm release:minor` (creates next minor tag, for example `v0.4` from `v0.3`)
2. `pnpm release:major` (creates next major tag, for example `v1.0` from `v0.9`)
3. `pnpm release:dev:minor` / `pnpm release:dev:major` (creates prerelease tags like `v1.2.0-dev.1`)
4. `pnpm release:minor:push` / `pnpm release:major:push` / `pnpm release:dev:minor:push` / `pnpm release:dev:major:push`
5. `pnpm release:promote:dev -- --dev-tag v1.2.0-dev.3 [--push]` (promote a vetted dev tag to a stable tag)

These commands:

1. Require a clean working tree.
2. Merge your source branch into `main`.
3. Sync app versions (`package.json` and `tauri.conf.json`) to the new tag.
4. Commit the version sync and create the annotated tag.

Tag format supports `v<major>.<minor>` and `v<major>.<minor>.<patch>`.  
For dev channel tags, use `v<major>.<minor>.<patch>-dev.<n>`.  
Internally app/package versions are normalized to valid semver (for example `1.2.0` or `1.2.0-dev.1`).

### In-Place Desktop Updates

GameNotebook now uses Tauri's updater flow with a Settings UI update action:

1. The app supports `stable` and `dev` channels (Settings toggle).
2. The shell queries a tiny update gateway endpoint that resolves channel + platform.
3. If a newer signed update is available, Settings shows release notes and install action.
4. Installing downloads signed updater bundle, verifies signature, installs, then relaunches.
5. Manual installer fallback is available from the release page link in Settings.

Updater operator checklist (one-time setup + ongoing releases):

1. Generate a Tauri updater keypair once.
2. Put the public key in `src-tauri/tauri.conf.json` (`tauri.updater.pubkey`).
3. Store updater private key in Azure Key Vault (`tauri-private-key`), not in GitHub secrets.
4. Store updater key password in Azure Key Vault (`tauri-key-password`) if key is password-protected.
5. Store macOS signing/notarization secrets in Azure Key Vault (Developer ID `.p12`, identity, and App Store Connect API key material).
6. Configure Azure Trusted Signing profile vars in GitHub repo variables for Windows signing.
7. Never commit private key or certificate material to the repo.
8. Push release tags using `pnpm release:*:push`; CI will build, sign, notarize, validate, and publish manifests automatically.
9. Do not hand-edit `latest.json`, `stable/latest.json`, or `dev/latest.json`; they are generated during release publish.

Release workflow updater artifacts:

1. Preflight fails if Azure OIDC login or Key Vault secret fetch fails.
2. Build jobs always set `ENABLE_UPDATER_ARTIFACTS=1`.
3. macOS build signs with Developer ID, notarizes/staples DMG, and verifies `codesign`/`spctl`/`stapler`.
4. Windows build signs installers via Azure Trusted Signing and verifies Authenticode signatures.
5. Build jobs verify full installers, updater artifacts/signatures, and OS signing reports.
6. Release job requires successful signing/notarization checks and generates channel manifests:
   - `stable-latest.json` for stable tags
   - `dev-latest.json` for dev tags
7. Stable tags also publish `latest.json` alias for backwards compatibility.
8. Release smoke checks verify manifest + signing report assets are downloadable after publish.

Local gateway run command:

```bash
pnpm updater:gateway:dev
```

Environment variables for gateway:

1. `GITHUB_OWNER` (default `jessefreeman`)
2. `GITHUB_REPO` (default `gamenotebook`)
3. `GITHUB_TOKEN` (optional, recommended to avoid API rate limits)
4. `PORT` (default `8787`)

Required GitHub Variables:

1. `AZURE_CLIENT_ID`
2. `AZURE_TENANT_ID`
3. `AZURE_SUBSCRIPTION_ID`
4. `AZURE_KEYVAULT_NAME`
5. `AZURE_TRUSTED_SIGNING_ENDPOINT`
6. `AZURE_TRUSTED_SIGNING_ACCOUNT`
7. `AZURE_TRUSTED_SIGNING_PROFILE`

Required Azure Key Vault secrets:

1. `tauri-private-key`
2. `tauri-key-password` (optional if key has no password)
3. `apple-dev-id-p12-base64`
4. `apple-dev-id-p12-password`
5. `apple-signing-identity`
6. `apple-team-id`
7. `apple-api-key-id`
8. `apple-api-issuer-id`
9. `apple-api-private-key-p8-base64`

Detailed release/updater guide:
`docs/release-and-updater-guide.md`

Gateway service details:
`docs/update-gateway.md`

Tag baseline reset runbook:
`docs/tag-baseline-migration.md`

Certified signing runbook:
`docs/certified-desktop-signing-runbook.md`

Cert + secret setup checklist:
`docs/cert-and-secrets-setup-checklist.md`

Prefilled copy/paste setup checklist:
`docs/cert-and-secrets-setup-checklist-prefilled.md`

Detailed build architecture and hardening notes:
`docs/build-system-hardening.md`

### Versioned macOS `.app` Build (Fast Local App Bundle)

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

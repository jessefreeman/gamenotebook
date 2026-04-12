# Release and Updater Guide

This guide defines the production release model for GameNotebook with:

1. Channel-based auto updates (`stable` / `dev`).
2. Signed updater bundles (Tauri minisign).
3. Certified OS installer signing:
   - macOS Developer ID + notarization.
   - Windows Azure Trusted Signing (cloud EV flow).
4. Azure Key Vault + GitHub OIDC for secret delivery (no private cert material in GitHub).

## Trust Model

There are two independent trust layers:

1. Updater trust (in-app updates):
   - Private key signs updater bundles in CI.
   - Public key in `src-tauri/tauri.conf.json` verifies bundle signatures at install time.
2. OS installer trust (manual install/download):
   - macOS: Developer ID code signing + notarization + stapling.
   - Windows: Authenticode signatures from Azure Trusted Signing.

Both layers must pass before release publish.

## Sources of Truth

1. GitHub:
   - Tags, release notes, manifests, installer/update artifacts.
2. Azure:
   - OIDC auth boundary for CI jobs.
   - Key Vault secret storage.
   - Trusted Signing account/profile for Windows signatures.
3. Apple:
   - Developer ID certificate trust chain and notarization service.

## Secret and Identity Contract

### GitHub repository variables (non-secret)

1. `AZURE_CLIENT_ID`
2. `AZURE_TENANT_ID`
3. `AZURE_SUBSCRIPTION_ID`
4. `AZURE_KEYVAULT_NAME`
5. `AZURE_TRUSTED_SIGNING_ENDPOINT`
6. `AZURE_TRUSTED_SIGNING_ACCOUNT`
7. `AZURE_TRUSTED_SIGNING_PROFILE`

### Azure Key Vault secret names

These are fetched by `scripts/fetch-signing-secrets-from-azure.cjs` and mapped into CI env vars:

1. `tauri-private-key` -> `TAURI_PRIVATE_KEY`
2. `tauri-key-password` -> `TAURI_KEY_PASSWORD` (optional)
3. `apple-dev-id-p12-base64` -> `APPLE_DEV_ID_P12_BASE64`
4. `apple-dev-id-p12-password` -> `APPLE_DEV_ID_P12_PASSWORD`
5. `apple-signing-identity` -> `APPLE_SIGNING_IDENTITY`
6. `apple-team-id` -> `APPLE_TEAM_ID`
7. `apple-api-key-id` -> `APPLE_API_KEY_ID`
8. `apple-api-issuer-id` -> `APPLE_API_ISSUER_ID`
9. `apple-api-private-key-p8-base64` -> `APPLE_API_PRIVATE_KEY_P8_BASE64`

Note: Azure Key Vault secret names are lowercase with dashes.

## One-Time Setup

1. Generate updater keypair:
```bash
pnpm exec tauri signer generate -w ~/.tauri/gamenotebook.key
```
2. Set `tauri.updater.pubkey` in `src-tauri/tauri.conf.json` to the generated public key.
3. Store updater private key (and optional password) in Azure Key Vault (`tauri-private-key`, `tauri-key-password`).
4. Create Apple Developer ID Application certificate and export `.p12` bundle.
5. Create App Store Connect API key (`.p8`) for notarization.
6. Base64-encode `.p12` and `.p8` contents and store all Apple values in Key Vault.
7. Configure GitHub OIDC federated credential for the repository/workflow in Azure AD app registration.
8. Set required GitHub repo variables listed above.
9. Provision Azure Trusted Signing account/profile and set endpoint/account/profile vars.

## Release Commands

### Stable tags

```bash
pnpm release:minor:push
pnpm release:major:push
```

### Dev tags

```bash
pnpm release:dev:minor:push
pnpm release:dev:major:push
```

### Promote dev tag to stable tag

```bash
pnpm release:promote:dev -- --dev-tag v1.4.0-dev.3 --push
```

## CI Flow on Tag Push

`/.github/workflows/tag-release-builds.yml` performs:

1. Preflight:
   - Validate tag format and `main` ancestry.
   - Derive channel (`stable`/`dev`).
   - Login to Azure with OIDC.
   - Validate Key Vault fetch path for updater secret.
2. Build matrix:
   - Fetch updater signing secrets for all platforms.
   - Fetch Apple signing/notary secrets for macOS.
   - Build installers + updater bundles.
   - macOS: import cert, sign bundle, notarize DMG, staple, verify (`codesign`, `spctl`, `stapler`).
   - Windows: trusted sign `.exe`/`.msi`, verify `Get-AuthenticodeSignature`.
   - Verify artifact completeness + updater signatures + OS signing reports.
3. Release publish (only if preflight and full build succeed):
   - Generate channel manifest (`stable-latest.json` or `dev-latest.json`).
   - Publish release assets, including signing reports.
4. Smoke checks:
   - Verify manifest URLs are downloadable.
   - Verify signing report assets are downloadable and valid.

## Updater Channel Behavior

1. App stores `updateChannel` (`stable` or `dev`).
2. App calls gateway endpoint in `tauri.conf.json`.
3. Gateway resolves channel manifest and returns Tauri updater JSON for platform target.
4. Stable tags publish:
   - `stable-latest.json`
   - `stable/latest.json`
   - `latest.json` (compat alias)
5. Dev tags publish:
   - `dev-latest.json`
   - `dev/latest.json`

## Safety Gates (Fail-Closed)

Release is blocked if any of these fail:

1. Azure OIDC or Key Vault retrieval.
2. Missing updater signing key.
3. Missing installer artifacts or updater bundle/signature files.
4. macOS signature/notarization/stapling verification failure.
5. Windows Authenticode signature verification failure.
6. Invalid generated updater manifest.

## Rollback Policy

1. In-app downgrade is not supported.
2. Use forward-fix hotfix releases with higher version.
3. Stable channel always points to newest known-good build.
4. Manual reinstall from historical installers is still possible if needed.

## Operational Runbooks

### Certificate/key renewal

1. Renew Apple Developer ID cert before expiry, export new `.p12`, update Key Vault secret.
2. Rotate App Store Connect API key if compromised/expired; update Key Vault.
3. Rotate updater minisign key only as a planned migration (old clients will not trust new key).
4. Maintain Azure Trusted Signing profile validity and policy.

### Incident recovery

1. If bad stable release shipped, publish a higher-version hotfix.
2. Keep channel manifest behavior unchanged (no rollback/downgrade path in app).
3. Use release notes to explain fix scope and affected versions.

### Pre-release dry run

1. Push dev tag first.
2. Confirm signed installers + updater manifests + in-app update detection.
3. Promote vetted dev tag to stable.

## Operator Checklists

1. Full certificate/secrets bootstrap checklist:
   - `docs/cert-and-secrets-setup-checklist.md`
2. Prefilled copy/paste checklist for this repo:
   - `docs/cert-and-secrets-setup-checklist-prefilled.md`
3. Ongoing certified release operations:
   - `docs/certified-desktop-signing-runbook.md`

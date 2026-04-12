# Certified Desktop Signing Runbook

This runbook is the operator reference for production-signed desktop releases.

## Goals

1. Every public release ships signed installers for macOS and Windows.
2. Every updater bundle is signed and verifiable by installed clients.
3. Secrets and cert material stay outside GitHub and are delivered through Azure OIDC + Key Vault.

## Architecture

1. GitHub Actions builds and publishes release artifacts.
2. Azure Key Vault stores updater key and Apple credential material.
3. Azure Trusted Signing signs Windows `.exe` and `.msi`.
4. Apple notarization validates and staples macOS DMG.

## Required GitHub Variables

Set these in repository variables:

1. `AZURE_CLIENT_ID`
2. `AZURE_TENANT_ID`
3. `AZURE_SUBSCRIPTION_ID`
4. `AZURE_KEYVAULT_NAME`
5. `AZURE_TRUSTED_SIGNING_ENDPOINT`
6. `AZURE_TRUSTED_SIGNING_ACCOUNT`
7. `AZURE_TRUSTED_SIGNING_PROFILE`

## Required Azure Key Vault Secrets

Create these secrets in the vault:

1. `tauri-private-key`
2. `tauri-key-password`
3. `apple-dev-id-p12-base64`
4. `apple-dev-id-p12-password`
5. `apple-signing-identity`
6. `apple-team-id`
7. `apple-api-key-id`
8. `apple-api-issuer-id`
9. `apple-api-private-key-p8-base64`

## OIDC Setup Checklist

1. Create or select an Azure AD app registration.
2. Add a federated credential for this GitHub repository/workflow.
3. Grant Key Vault secret read permissions to that app identity.
4. Grant Trusted Signing permissions to that app identity.
5. Verify `azure/login@v2` succeeds in CI without client secret.

## Apple Material Preparation

1. Export Developer ID Application cert as `.p12`.
2. Base64 encode `.p12`:
```bash
base64 < developer-id.p12 | tr -d '\n'
```
3. Generate App Store Connect API key (`.p8`) and base64 encode:
```bash
base64 < AuthKey_ABC123XYZ.p8 | tr -d '\n'
```
4. Store values in Key Vault under the names above.

## Release Execution

1. Create/push tag via release script (`release:minor:push`, etc.).
2. CI preflight validates tag and Key Vault path.
3. Build matrix runs:
   - macOS signing + notarization + stapling + validation.
   - Windows trusted signing + Authenticode verification.
   - updater artifact validation.
4. Release publishes only if all checks pass.
5. Smoke checks confirm manifest and signing report asset reachability.

## Verification Artifacts

Each release includes:

1. Full installers (`.dmg`, `.msi`, `.exe`, Linux package output).
2. Updater bundles + `.sig`.
3. Channel manifests (`stable-latest.json` or `dev-latest.json`).
4. `macos-signing-report.json`.
5. `windows-signing-report.json`.

## Failure Handling

1. If mac notarization fails:
   - inspect workflow logs for notarytool status.
   - verify Apple API key/issuer values in Key Vault.
   - verify Developer ID cert validity/expiration.
2. If Windows signing fails:
   - verify Trusted Signing endpoint/account/profile vars.
   - verify Azure identity has permission for signing profile.
3. If updater signature fails:
   - verify `tauri-private-key` matches app embedded public key.

## Rotation and Renewal

1. Apple cert renewal:
   - export new `.p12`, update Key Vault, run dev-tag dry run.
2. Apple API key rotation:
   - update key id/issuer/p8 secrets and rerun dev-tag pipeline.
3. Updater key rotation:
   - requires explicit migration plan; old clients will reject new key otherwise.
4. Trusted Signing profile changes:
   - update GitHub vars and run dev-tag validation before stable promotion.

## Forward-Fix Policy

1. No in-app downgrade path.
2. Bad stable releases are corrected via a higher-version hotfix.
3. Stable channel always points to the latest known-good release.

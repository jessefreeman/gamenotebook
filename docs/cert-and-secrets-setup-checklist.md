# Certificate and Secrets Setup Checklist (Step-by-Step)

Use this checklist to set up everything required for certified macOS/Windows releases and signed auto-updates.

## 0) Prerequisites

1. Installed CLIs:
```bash
az version
gh --version
node --version
pnpm --version
```
2. Logged in:
```bash
az login
gh auth status
```
3. You are in the repo root:
```bash
pwd
```

## 1) Generate or confirm the Tauri updater keypair

1. Generate (one-time):
```bash
pnpm exec tauri signer generate -w ~/.tauri/gamenotebook.key
```
2. Inspect public key:
```bash
cat ~/.tauri/gamenotebook.key.pub
```
3. Ensure `tauri.updater.pubkey` in [src-tauri/tauri.conf.json](/Volumes/My%20Shared%20Files/Projects/gamenotepad/src-tauri/tauri.conf.json) matches exactly.
4. Keep `~/.tauri/gamenotebook.key` secure and backed up.

## 2) Create or identify Azure resources

1. Choose resource names (replace placeholders):
```bash
export AZ_RG="gamenotebook-release-rg"
export AZ_LOCATION="eastus"
export AZ_KV_NAME="gamenotebook-release-kv"
```
2. Create resource group (if needed):
```bash
az group create --name "$AZ_RG" --location "$AZ_LOCATION"
```
3. Create Key Vault (if needed):
```bash
az keyvault create --name "$AZ_KV_NAME" --resource-group "$AZ_RG" --location "$AZ_LOCATION"
```

## 3) Configure GitHub OIDC identity in Azure

1. Create/choose Azure AD app registration and capture IDs:
```bash
export AZ_APP_OBJECT_ID="<app-object-id>"
export AZ_APP_CLIENT_ID="<app-client-id>"
export AZ_TENANT_ID="$(az account show --query tenantId -o tsv)"
export AZ_SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
```
2. Create federated credential (adjust org/repo as needed):
```bash
az ad app federated-credential create \
  --id "$AZ_APP_OBJECT_ID" \
  --parameters "{
    \"name\": \"gamenotebook-tag-release\",
    \"issuer\": \"https://token.actions.githubusercontent.com\",
    \"subject\": \"repo:jessefreeman/gamenotebook:ref:refs/tags/*\",
    \"audiences\": [\"api://AzureADTokenExchange\"]
  }"
```
3. Grant Key Vault secret read permissions to this identity (recommended via RBAC):
```bash
export AZ_PRINCIPAL_ID="<service-principal-object-id>"
az role assignment create \
  --assignee-object-id "$AZ_PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" \
  --scope "$(az keyvault show --name "$AZ_KV_NAME" --query id -o tsv)"
```

## 4) Upload updater secrets to Azure Key Vault

1. Upload updater private key:
```bash
az keyvault secret set \
  --vault-name "$AZ_KV_NAME" \
  --name "tauri-private-key" \
  --file "$HOME/.tauri/gamenotebook.key"
```
2. Optional updater key password:
```bash
az keyvault secret set \
  --vault-name "$AZ_KV_NAME" \
  --name "tauri-key-password" \
  --value "<KEY_PASSWORD>"
```

## 5) Prepare Apple signing + notarization material

1. In Apple Developer, create/export a **Developer ID Application** certificate as `.p12`.
2. Create App Store Connect API key (`.p8`) and record:
   - Key ID
   - Issuer ID
3. Base64 encode files:
```bash
base64 < /path/to/developer-id.p12 | tr -d '\n' > /tmp/apple-dev-id-p12.base64.txt
base64 < /path/to/AuthKey_XXXXXX.p8 | tr -d '\n' > /tmp/apple-api-key.base64.txt
```
4. Upload Apple secrets to Key Vault:
```bash
az keyvault secret set --vault-name "$AZ_KV_NAME" --name "apple-dev-id-p12-base64" --value "$(cat /tmp/apple-dev-id-p12.base64.txt)"
az keyvault secret set --vault-name "$AZ_KV_NAME" --name "apple-dev-id-p12-password" --value "<P12_PASSWORD>"
az keyvault secret set --vault-name "$AZ_KV_NAME" --name "apple-signing-identity" --value "Developer ID Application: <Company Name> (<TEAM_ID>)"
az keyvault secret set --vault-name "$AZ_KV_NAME" --name "apple-team-id" --value "<TEAM_ID>"
az keyvault secret set --vault-name "$AZ_KV_NAME" --name "apple-api-key-id" --value "<APPLE_API_KEY_ID>"
az keyvault secret set --vault-name "$AZ_KV_NAME" --name "apple-api-issuer-id" --value "<APPLE_API_ISSUER_ID>"
az keyvault secret set --vault-name "$AZ_KV_NAME" --name "apple-api-private-key-p8-base64" --value "$(cat /tmp/apple-api-key.base64.txt)"
```

## 6) Configure Azure Trusted Signing for Windows

1. Provision Trusted Signing account + certificate profile in Azure.
2. Capture these values:
   - Trusted Signing endpoint URL
   - Account name
   - Certificate profile name
3. Grant the GitHub OIDC identity permission to sign with that profile.

## 7) Set GitHub repository variables

Run in repo root (`gh` must be authenticated against this repo):

```bash
gh variable set AZURE_CLIENT_ID --body "$AZ_APP_CLIENT_ID"
gh variable set AZURE_TENANT_ID --body "$AZ_TENANT_ID"
gh variable set AZURE_SUBSCRIPTION_ID --body "$AZ_SUBSCRIPTION_ID"
gh variable set AZURE_KEYVAULT_NAME --body "$AZ_KV_NAME"
gh variable set AZURE_TRUSTED_SIGNING_ENDPOINT --body "<TRUSTED_SIGNING_ENDPOINT>"
gh variable set AZURE_TRUSTED_SIGNING_ACCOUNT --body "<TRUSTED_SIGNING_ACCOUNT>"
gh variable set AZURE_TRUSTED_SIGNING_PROFILE --body "<TRUSTED_SIGNING_PROFILE>"
```

## 8) Run readiness validation

1. Full readiness check:
```bash
pnpm release:check:certified-ready -- --keyvault "$AZ_KV_NAME"
```
2. If failures are shown, fix missing vars/secrets and rerun until it passes.

## 9) Run first dev-tag dry run

1. Push a dev release tag using automation:
```bash
pnpm release:dev:minor:push
```
2. In Actions, verify:
   - Azure login succeeds in preflight and matrix jobs.
   - macOS notarization step passes.
   - Windows Trusted Signing + Authenticode verify pass.
   - `release-files/macos-signing-report.json` and `release-files/windows-signing-report.json` are attached to release.
   - `dev-latest.json` exists on the release.

## 10) Promote to stable

1. After validating dev release:
```bash
pnpm release:promote:dev -- --dev-tag vX.Y.Z-dev.N --push
```
2. Verify stable release assets include:
   - `stable-latest.json`
   - `latest.json`
   - signed installers + signing reports

## 11) Ongoing maintenance checklist

1. Renew Apple Developer ID cert before expiration and update Key Vault secrets.
2. Rotate App Store Connect API key as needed and update Key Vault.
3. Maintain Trusted Signing profile access for GitHub OIDC identity.
4. Never rotate updater minisign key without a migration plan.
5. Run `pnpm release:check:certified-ready -- --keyvault "$AZ_KV_NAME"` before major release events.

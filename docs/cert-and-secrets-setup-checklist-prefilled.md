# Prefilled Certified Release Setup (Copy/Paste)

This is the prefilled version for repository `jessefreeman/gamenotebook`.

## 1) Set baseline variables in your terminal

Run this block first:

```bash
export GITHUB_REPOSITORY="jessefreeman/gamenotebook"

export AZ_RG="gamenotebook-release-rg"
export AZ_LOCATION="eastus"
export AZ_KV_NAME="gamenotebook-release-kv"

export AZ_APP_DISPLAY_NAME="gamenotebook-gha-oidc"
export AZ_FED_CRED_NAME="gamenotebook-tag-release"

# Set these after Trusted Signing is provisioned:
export AZURE_TRUSTED_SIGNING_ENDPOINT="<REPLACE_WITH_ENDPOINT>"
export AZURE_TRUSTED_SIGNING_ACCOUNT="<REPLACE_WITH_ACCOUNT_NAME>"
export AZURE_TRUSTED_SIGNING_PROFILE="<REPLACE_WITH_PROFILE_NAME>"
```

## 2) Login and bootstrap Azure resources

```bash
az login
az account set --subscription "<REPLACE_WITH_SUBSCRIPTION_NAME_OR_ID>"
```

```bash
az group create --name "$AZ_RG" --location "$AZ_LOCATION"
az keyvault create --name "$AZ_KV_NAME" --resource-group "$AZ_RG" --location "$AZ_LOCATION"
```

## 3) Create Azure AD app for GitHub OIDC

```bash
export AZURE_TENANT_ID="$(az account show --query tenantId -o tsv)"
export AZURE_SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
```

```bash
export AZURE_CLIENT_ID="$(az ad app create --display-name "$AZ_APP_DISPLAY_NAME" --query appId -o tsv)"
az ad sp create --id "$AZURE_CLIENT_ID" >/dev/null
export AZ_APP_OBJECT_ID="$(az ad app show --id "$AZURE_CLIENT_ID" --query id -o tsv)"
export AZ_SP_OBJECT_ID="$(az ad sp show --id "$AZURE_CLIENT_ID" --query id -o tsv)"
```

```bash
az ad app federated-credential create \
  --id "$AZ_APP_OBJECT_ID" \
  --parameters "{
    \"name\": \"${AZ_FED_CRED_NAME}\",
    \"issuer\": \"https://token.actions.githubusercontent.com\",
    \"subject\": \"repo:${GITHUB_REPOSITORY}:ref:refs/tags/*\",
    \"audiences\": [\"api://AzureADTokenExchange\"]
  }"
```

Grant Key Vault read:

```bash
az role assignment create \
  --assignee-object-id "$AZ_SP_OBJECT_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" \
  --scope "$(az keyvault show --name "$AZ_KV_NAME" --query id -o tsv)"
```

## 4) Generate/update Tauri updater key and set app pubkey

```bash
pnpm exec tauri signer generate -w ~/.tauri/gamenotebook.key
cat ~/.tauri/gamenotebook.key.pub
```

Ensure `tauri.updater.pubkey` in [src-tauri/tauri.conf.json](/Volumes/My%20Shared%20Files/Projects/gamenotepad/src-tauri/tauri.conf.json) is exactly this public key.

## 5) Upload updater secrets to Key Vault

```bash
az keyvault secret set --vault-name "$AZ_KV_NAME" --name "tauri-private-key" --file "$HOME/.tauri/gamenotebook.key"
```

Optional if your updater key has a password:

```bash
az keyvault secret set --vault-name "$AZ_KV_NAME" --name "tauri-key-password" --value "<REPLACE_WITH_KEY_PASSWORD>"
```

## 6) Create Apple cert/notary materials and upload

1. Export Developer ID Application cert as `.p12` from Keychain Access.
2. Create App Store Connect API key (`.p8`) and record key ID + issuer ID.
3. Base64 encode both files:

```bash
base64 < /path/to/developer-id.p12 | tr -d '\n' > /tmp/apple-dev-id-p12.base64.txt
base64 < /path/to/AuthKey_XXXXXX.p8 | tr -d '\n' > /tmp/apple-api-key.base64.txt
```

4. Upload to Key Vault:

```bash
az keyvault secret set --vault-name "$AZ_KV_NAME" --name "apple-dev-id-p12-base64" --value "$(cat /tmp/apple-dev-id-p12.base64.txt)"
az keyvault secret set --vault-name "$AZ_KV_NAME" --name "apple-dev-id-p12-password" --value "<REPLACE_WITH_P12_PASSWORD>"
az keyvault secret set --vault-name "$AZ_KV_NAME" --name "apple-signing-identity" --value "Developer ID Application: <Your Company> (<TEAM_ID>)"
az keyvault secret set --vault-name "$AZ_KV_NAME" --name "apple-team-id" --value "<TEAM_ID>"
az keyvault secret set --vault-name "$AZ_KV_NAME" --name "apple-api-key-id" --value "<APPLE_API_KEY_ID>"
az keyvault secret set --vault-name "$AZ_KV_NAME" --name "apple-api-issuer-id" --value "<APPLE_API_ISSUER_ID>"
az keyvault secret set --vault-name "$AZ_KV_NAME" --name "apple-api-private-key-p8-base64" --value "$(cat /tmp/apple-api-key.base64.txt)"
```

## 7) Configure Azure Trusted Signing

1. Provision Trusted Signing account/profile in Azure portal.
2. Set:
   - `AZURE_TRUSTED_SIGNING_ENDPOINT`
   - `AZURE_TRUSTED_SIGNING_ACCOUNT`
   - `AZURE_TRUSTED_SIGNING_PROFILE`
3. Grant your GitHub OIDC app identity permission to sign with that profile.

## 8) Push required GitHub variables in one command

```bash
export AZURE_KEYVAULT_NAME="$AZ_KV_NAME"
pnpm release:set:github-vars
```

This uses [scripts/set-certified-release-github-vars.sh](/Volumes/My%20Shared%20Files/Projects/gamenotepad/scripts/set-certified-release-github-vars.sh).

## 9) Run readiness validation

```bash
pnpm release:check:certified-ready -- --keyvault "$AZ_KV_NAME"
```

Fix any missing items until it prints `Certified release readiness check passed.`

## 10) First dev release dry run

```bash
pnpm release:dev:minor:push
```

In GitHub Actions, confirm:

1. `Azure login (OIDC)` passes.
2. Key Vault fetch steps pass.
3. macOS notarization step passes.
4. Windows trusted signing + Authenticode verify pass.
5. Release contains:
   - `dev-latest.json`
   - `macos-signing-report.json`
   - `windows-signing-report.json`

## 11) Promote to stable after validation

```bash
pnpm release:promote:dev -- --dev-tag vX.Y.Z-dev.N --push
```

Then verify release has:

1. `stable-latest.json`
2. `latest.json`
3. Signed installers and signing reports.

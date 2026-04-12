#!/usr/bin/env bash
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-jessefreeman/gamenotebook}"

required_vars=(
  AZURE_CLIENT_ID
  AZURE_TENANT_ID
  AZURE_SUBSCRIPTION_ID
  AZURE_KEYVAULT_NAME
  AZURE_TRUSTED_SIGNING_ENDPOINT
  AZURE_TRUSTED_SIGNING_ACCOUNT
  AZURE_TRUSTED_SIGNING_PROFILE
)

missing=()
for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    missing+=("$var_name")
  fi
done

if (( ${#missing[@]} > 0 )); then
  echo "Missing required environment variables:"
  for name in "${missing[@]}"; do
    echo "- $name"
  done
  echo ""
  echo "Export all required variables, then rerun this script."
  exit 1
fi

for var_name in "${required_vars[@]}"; do
  gh variable set "$var_name" --repo "$REPO" --body "${!var_name}"
  echo "Set $var_name in $REPO"
done

echo ""
echo "GitHub certified-release variables updated successfully for $REPO."

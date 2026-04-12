#!/usr/bin/env node

"use strict"

const { spawnSync } = require("node:child_process")

const REQUIRED_GITHUB_VARS = [
  "AZURE_CLIENT_ID",
  "AZURE_TENANT_ID",
  "AZURE_SUBSCRIPTION_ID",
  "AZURE_KEYVAULT_NAME",
  "AZURE_TRUSTED_SIGNING_ENDPOINT",
  "AZURE_TRUSTED_SIGNING_ACCOUNT",
  "AZURE_TRUSTED_SIGNING_PROFILE",
]

const REQUIRED_KEYVAULT_SECRETS = [
  { name: "tauri-private-key", optional: false },
  { name: "tauri-key-password", optional: true },
  { name: "apple-dev-id-p12-base64", optional: false },
  { name: "apple-dev-id-p12-password", optional: false },
  { name: "apple-signing-identity", optional: false },
  { name: "apple-team-id", optional: true },
  { name: "apple-api-key-id", optional: false },
  { name: "apple-api-issuer-id", optional: false },
  { name: "apple-api-private-key-p8-base64", optional: false },
]

function usage() {
  console.log(`Usage:
  node scripts/check-certified-release-readiness.cjs [--keyvault <name>] [--skip-github] [--skip-keyvault]

Options:
  --keyvault       Azure Key Vault name. Defaults to AZURE_KEYVAULT_NAME env.
  --skip-github    Skip GitHub variable checks.
  --skip-keyvault  Skip Azure Key Vault secret checks.
  --help, -h       Show this help message.

Notes:
  - GitHub checks require authenticated gh CLI (repo context).
  - Key Vault checks require az CLI login with access to the vault.`)
}

function parseArgs(argv) {
  const options = {
    keyvault: process.env.AZURE_KEYVAULT_NAME || null,
    skipGithub: false,
    skipKeyvault: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--help" || arg === "-h") {
      usage()
      process.exit(0)
    }
    if (arg === "--skip-github") {
      options.skipGithub = true
      continue
    }
    if (arg === "--skip-keyvault") {
      options.skipKeyvault = true
      continue
    }
    if (arg === "--keyvault") {
      options.keyvault = argv[i + 1] || null
      i += 1
      continue
    }
    if (arg.startsWith("--keyvault=")) {
      options.keyvault = arg.slice("--keyvault=".length)
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!options.skipKeyvault && !options.keyvault) {
    throw new Error("Missing --keyvault (or AZURE_KEYVAULT_NAME) for key vault checks.")
  }

  return options
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: options.capture ? "pipe" : "inherit",
    encoding: options.capture ? "utf8" : undefined,
  })
}

function getGithubVariables() {
  const result = run("gh", ["variable", "list", "--json", "name"], { capture: true })
  if (result.error) {
    throw new Error(`Failed to run gh CLI: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`gh variable list failed with exit code ${result.status}`)
  }
  let rows = []
  try {
    rows = JSON.parse(String(result.stdout || "[]"))
  } catch (error) {
    throw new Error(`Failed to parse gh variable list output: ${error.message}`)
  }
  return new Set(rows.map((row) => String(row.name || "").trim()).filter(Boolean))
}

function checkKeyVaultSecret(vaultName, secretName) {
  const result = run(
    "az",
    [
      "keyvault",
      "secret",
      "show",
      "--vault-name",
      vaultName,
      "--name",
      secretName,
      "--query",
      "id",
      "-o",
      "tsv",
    ],
    { capture: true }
  )

  if (result.error) {
    throw new Error(`Failed to run az CLI: ${result.error.message}`)
  }
  if (result.status !== 0) {
    return false
  }
  return Boolean(String(result.stdout || "").trim())
}

function printList(title, values) {
  console.log(title)
  for (const value of values) {
    console.log(`- ${value}`)
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))

  let failed = false

  if (!options.skipGithub) {
    console.log("Checking GitHub repository variables...")
    const availableVars = getGithubVariables()
    const missingVars = REQUIRED_GITHUB_VARS.filter((name) => !availableVars.has(name))
    if (missingVars.length > 0) {
      failed = true
      printList("Missing GitHub variables:", missingVars)
    } else {
      console.log("GitHub variables: OK")
    }
    console.log("")
  } else {
    console.log("Skipping GitHub variable checks.")
    console.log("")
  }

  if (!options.skipKeyvault) {
    console.log(`Checking Azure Key Vault secrets in '${options.keyvault}'...`)
    const missingRequired = []
    const missingOptional = []
    for (const secret of REQUIRED_KEYVAULT_SECRETS) {
      const exists = checkKeyVaultSecret(options.keyvault, secret.name)
      if (!exists && secret.optional) {
        missingOptional.push(secret.name)
      } else if (!exists) {
        missingRequired.push(secret.name)
      }
    }

    if (missingRequired.length > 0) {
      failed = true
      printList("Missing required Key Vault secrets:", missingRequired)
    } else {
      console.log("Required Key Vault secrets: OK")
    }

    if (missingOptional.length > 0) {
      printList("Missing optional Key Vault secrets:", missingOptional)
    }
    console.log("")
  } else {
    console.log("Skipping Azure Key Vault checks.")
    console.log("")
  }

  if (failed) {
    console.error("Certified release readiness check failed.")
    process.exit(1)
  }

  console.log("Certified release readiness check passed.")
}

main()

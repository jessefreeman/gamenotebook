#!/usr/bin/env node

"use strict"

const fs = require("node:fs")
const path = require("node:path")
const https = require("node:https")
const { spawnSync } = require("node:child_process")

function usage() {
  console.log(`Usage:
  node scripts/fetch-signing-secrets-from-azure.cjs --keyvault <name> --secrets <spec> [--env-file <path>]

Options:
  --keyvault        Azure Key Vault name (or set AZURE_KEYVAULT_NAME).
  --secrets         Comma/newline-delimited list of secret mappings.
                    Format: ENV_NAME=keyvault-secret-name
                    Optional format: ENV_NAME?=keyvault-secret-name
                    Example: TAURI_PRIVATE_KEY=tauri-private-key,TAURI_KEY_PASSWORD=tauri-key-password
  --env-file        Optional env file output path. Defaults to GITHUB_ENV if available.
  --help, -h        Show this help message.`)
}

function parseArgs(argv) {
  const options = {
    keyvault: process.env.AZURE_KEYVAULT_NAME || null,
    secrets: null,
    envFile: process.env.GITHUB_ENV || null,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--help" || arg === "-h") {
      usage()
      process.exit(0)
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
    if (arg === "--secrets") {
      options.secrets = argv[i + 1] || null
      i += 1
      continue
    }
    if (arg.startsWith("--secrets=")) {
      options.secrets = arg.slice("--secrets=".length)
      continue
    }
    if (arg === "--env-file") {
      options.envFile = argv[i + 1] || null
      i += 1
      continue
    }
    if (arg.startsWith("--env-file=")) {
      options.envFile = arg.slice("--env-file=".length)
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!options.keyvault) {
    throw new Error("Missing --keyvault (or AZURE_KEYVAULT_NAME).")
  }
  if (!options.secrets) {
    throw new Error("Missing --secrets.")
  }
  if (!options.envFile) {
    throw new Error("Missing --env-file and GITHUB_ENV is not set.")
  }

  return options
}

function parseSecretMappings(raw) {
  const tokens = String(raw)
    .split(/\r?\n|,/)
    .map((token) => token.trim())
    .filter(Boolean)

  if (tokens.length === 0) {
    throw new Error("No secrets specified.")
  }

  return tokens.map((token) => {
    const parts = token.split("=").map((x) => x.trim())
    if (parts.length === 1) {
      const envName = parts[0].replace(/[^A-Za-z0-9_]/g, "_").toUpperCase()
      return { envName, secretName: parts[0], optional: false }
    }
    if (parts.length === 2) {
      const rawEnvName = parts[0]
      const optional = rawEnvName.endsWith("?")
      const envName = optional ? rawEnvName.slice(0, -1) : rawEnvName
      const secretName = parts[1]
      if (!envName || !secretName) {
        throw new Error(`Invalid secret mapping: '${token}'`)
      }
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(envName)) {
        throw new Error(`Invalid env var name '${envName}' in mapping '${token}'.`)
      }
      return { envName, secretName, optional }
    }
    throw new Error(`Invalid secret mapping: '${token}'`)
  })
}

function runAz(args) {
  const result = spawnSync("az", args, {
    stdio: "pipe",
    encoding: "utf8",
    env: {
      ...process.env,
      AZURE_CORE_OUTPUT: "none",
    },
  })
  if (result.error || result.status !== 0) {
    return null
  }
  return String(result.stdout || "").trim()
}

function requestJson({ method, url, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers }, (res) => {
      let data = ""
      res.setEncoding("utf8")
      res.on("data", (chunk) => {
        data += chunk
      })
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(
            new Error(`HTTP ${res.statusCode} for ${url}\n${String(data).slice(0, 500)}`)
          )
        }
        try {
          resolve(JSON.parse(data))
        } catch (error) {
          reject(new Error(`Failed to parse JSON from ${url}: ${error.message}`))
        }
      })
    })
    req.on("error", reject)
    if (body) {
      req.write(body)
    }
    req.end()
  })
}

async function getAccessTokenFromFederatedIdentity() {
  const tenantId = process.env.AZURE_TENANT_ID
  const clientId = process.env.AZURE_CLIENT_ID
  const tokenFile = process.env.AZURE_FEDERATED_TOKEN_FILE
  const authorityHost = process.env.AZURE_AUTHORITY_HOST || "https://login.microsoftonline.com"

  if (!tenantId || !clientId || !tokenFile) {
    return null
  }

  if (!fs.existsSync(tokenFile)) {
    throw new Error(`AZURE_FEDERATED_TOKEN_FILE does not exist: ${tokenFile}`)
  }

  const federatedToken = fs.readFileSync(tokenFile, "utf8").trim()
  if (!federatedToken) {
    throw new Error("Federated token file is empty.")
  }

  const tokenUrl = `${authorityHost.replace(/\/$/, "")}/${tenantId}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    client_id: clientId,
    scope: "https://vault.azure.net/.default",
    grant_type: "client_credentials",
    client_assertion_type:
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: federatedToken,
  }).toString()

  const response = await requestJson({
    method: "POST",
    url: tokenUrl,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "content-length": String(Buffer.byteLength(body)),
    },
    body,
  })

  if (!response.access_token) {
    throw new Error("Token response does not include access_token.")
  }
  return response.access_token
}

async function getKeyVaultAccessToken() {
  const azToken = runAz([
    "account",
    "get-access-token",
    "--resource",
    "https://vault.azure.net",
    "--query",
    "accessToken",
    "-o",
    "tsv",
  ])
  if (azToken) {
    return azToken
  }

  const federatedToken = await getAccessTokenFromFederatedIdentity()
  if (federatedToken) {
    return federatedToken
  }

  throw new Error(
    "Unable to acquire Azure Key Vault token. Ensure azure/login OIDC ran before this step."
  )
}

async function fetchSecretValue(keyvaultName, secretName, accessToken) {
  const url = `https://${keyvaultName}.vault.azure.net/secrets/${encodeURIComponent(
    secretName
  )}?api-version=7.4`
  const response = await requestJson({
    method: "GET",
    url,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!response || typeof response.value !== "string" || !response.value) {
    throw new Error(`Secret '${secretName}' in key vault '${keyvaultName}' is empty or invalid.`)
  }
  return response.value
}

function appendEnvLines(envFilePath, entries) {
  fs.mkdirSync(path.dirname(envFilePath), { recursive: true })
  const lines = []
  for (const { name, value } of entries) {
    lines.push(`${name}<<__CODEx_EOF__`)
    lines.push(value)
    lines.push("__CODEx_EOF__")
  }
  fs.appendFileSync(envFilePath, `${lines.join("\n")}\n`, "utf8")
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const mappings = parseSecretMappings(options.secrets)
  const accessToken = await getKeyVaultAccessToken()

  const values = []
  for (const { envName, secretName, optional } of mappings) {
    let value = null
    try {
      value = await fetchSecretValue(options.keyvault, secretName, accessToken)
    } catch (error) {
      const message = error && error.message ? error.message : String(error)
      if (optional && message.includes("HTTP 404")) {
        console.log(`Optional secret not found, skipping: ${secretName}`)
        continue
      }
      throw error
    }
    console.log(`::add-mask::${value}`)
    values.push({ name: envName, value })
    console.log(`Fetched ${secretName} -> ${envName}`)
  }

  appendEnvLines(options.envFile, values)
  console.log(`Wrote ${values.length} secrets to ${options.envFile}`)
}

main().catch((error) => {
  console.error(error.message || String(error))
  process.exit(1)
})

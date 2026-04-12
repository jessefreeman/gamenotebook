#!/usr/bin/env node

"use strict"

const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

function usage() {
  console.log(`Usage:
  node scripts/macos-notarize-and-verify.cjs --dmg <path> --app <path> [--report <path>]

Environment:
  APPLE_API_KEY_ID
  APPLE_API_ISSUER_ID
  APPLE_API_PRIVATE_KEY_P8_BASE64

This script:
  1. Submits DMG for notarization and waits for completion.
  2. Verifies app signature with codesign + spctl.
  3. Staples notarization ticket to DMG and validates it.
  4. Emits a JSON report for CI gating.`)
}

function parseArgs(argv) {
  const options = {
    dmg: null,
    app: null,
    report: null,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--help" || arg === "-h") {
      usage()
      process.exit(0)
    }
    if (arg === "--dmg") {
      options.dmg = argv[i + 1] || null
      i += 1
      continue
    }
    if (arg.startsWith("--dmg=")) {
      options.dmg = arg.slice("--dmg=".length)
      continue
    }
    if (arg === "--app") {
      options.app = argv[i + 1] || null
      i += 1
      continue
    }
    if (arg.startsWith("--app=")) {
      options.app = arg.slice("--app=".length)
      continue
    }
    if (arg === "--report") {
      options.report = argv[i + 1] || null
      i += 1
      continue
    }
    if (arg.startsWith("--report=")) {
      options.report = arg.slice("--report=".length)
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!options.dmg || !options.app) {
    throw new Error("Missing required --dmg and --app arguments.")
  }
  if (!options.report) {
    options.report = path.join(path.dirname(path.resolve(options.dmg)), "macos-signing-report.json")
  }
  return options
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? "pipe" : "inherit",
    encoding: options.capture ? "utf8" : undefined,
    env: options.env || process.env,
  })
  if (result.error) {
    throw new Error(`Failed to run '${command} ${args.join(" ")}': ${result.error.message}`)
  }
  if (result.status !== 0) {
    const stderr = options.capture ? String(result.stderr || "").trim() : ""
    throw new Error(
      `Command failed (${result.status}): ${command} ${args.join(" ")}${stderr ? `\n${stderr}` : ""}`
    )
  }
  return options.capture ? String(result.stdout || "").trim() : ""
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

function parseNotaryResponse(output) {
  try {
    return JSON.parse(output)
  } catch (error) {
    throw new Error(`Failed to parse notarytool JSON output: ${error.message}`)
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const dmgPath = path.resolve(options.dmg)
  const appPath = path.resolve(options.app)
  const reportPath = path.resolve(options.report)

  if (!fs.existsSync(dmgPath)) {
    throw new Error(`DMG not found: ${dmgPath}`)
  }
  if (!fs.existsSync(appPath)) {
    throw new Error(`App not found: ${appPath}`)
  }

  const keyId = requireEnv("APPLE_API_KEY_ID")
  const issuerId = requireEnv("APPLE_API_ISSUER_ID")
  const p8Base64 = requireEnv("APPLE_API_PRIVATE_KEY_P8_BASE64")

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gamenotebook-notary-"))
  const keyPath = path.join(tempDir, "AuthKey.p8")

  let report = null
  try {
    fs.writeFileSync(keyPath, Buffer.from(p8Base64, "base64"), "utf8")
    fs.chmodSync(keyPath, 0o600)

    run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath])
    run("spctl", ["--assess", "--type", "execute", "--verbose=4", appPath])

    const notaryOutput = run(
      "xcrun",
      [
        "notarytool",
        "submit",
        dmgPath,
        "--key",
        keyPath,
        "--key-id",
        keyId,
        "--issuer",
        issuerId,
        "--wait",
        "--output-format",
        "json",
      ],
      { capture: true }
    )
    const notaryJson = parseNotaryResponse(notaryOutput)
    const status = String(notaryJson.status || "").toLowerCase()
    if (status !== "accepted") {
      throw new Error(
        `Notarization failed with status '${notaryJson.status || "unknown"}' for ${dmgPath}`
      )
    }

    run("xcrun", ["stapler", "staple", "-v", dmgPath])
    run("xcrun", ["stapler", "validate", "-v", dmgPath])
    run("spctl", ["--assess", "--type", "open", "--verbose=4", dmgPath])

    report = {
      generatedAt: new Date().toISOString(),
      dmgPath,
      appPath,
      notarization: {
        status: notaryJson.status || "Accepted",
        id: notaryJson.id || null,
        message: notaryJson.message || null,
      },
      checks: {
        codesignVerified: true,
        appSpctlVerified: true,
        stapled: true,
        staplerValidated: true,
        dmgSpctlVerified: true,
      },
      passed: true,
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }

  writeJson(reportPath, report)
  console.log(`macOS notarization/signature checks passed: ${reportPath}`)
}

main()

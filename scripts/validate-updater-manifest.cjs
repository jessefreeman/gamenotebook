#!/usr/bin/env node

"use strict"

const fs = require("node:fs")
const path = require("node:path")

function usage() {
  console.log(`Usage:
  node scripts/validate-updater-manifest.cjs --manifest <path>

Validates required Tauri updater manifest fields and per-platform URL/signature entries.`)
}

function parseArgs(argv) {
  let manifestPath = null
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--help" || arg === "-h") {
      usage()
      process.exit(0)
    }
    if (arg === "--manifest") {
      manifestPath = argv[i + 1] || null
      i += 1
      continue
    }
    if (arg.startsWith("--manifest=")) {
      manifestPath = arg.slice("--manifest=".length)
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  if (!manifestPath) {
    throw new Error("Missing --manifest.")
  }
  return path.resolve(manifestPath)
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0
}

function main() {
  const manifestPath = parseArgs(process.argv.slice(2))
  const text = fs.readFileSync(manifestPath, "utf8")
  const manifest = JSON.parse(text)

  if (!isNonEmptyString(manifest.version)) {
    throw new Error(`Manifest ${manifestPath} missing non-empty 'version'.`)
  }
  if (!isNonEmptyString(manifest.notes)) {
    throw new Error(`Manifest ${manifestPath} missing non-empty 'notes'.`)
  }
  if (!isNonEmptyString(manifest.pub_date)) {
    throw new Error(`Manifest ${manifestPath} missing non-empty 'pub_date'.`)
  }

  const platforms = manifest.platforms
  if (!platforms || typeof platforms !== "object") {
    throw new Error(`Manifest ${manifestPath} missing 'platforms' object.`)
  }

  const entries = Object.entries(platforms)
  if (entries.length === 0) {
    throw new Error(`Manifest ${manifestPath} has empty 'platforms'.`)
  }

  for (const [target, value] of entries) {
    if (!value || typeof value !== "object") {
      throw new Error(`Manifest ${manifestPath} target '${target}' has invalid entry.`)
    }
    if (!isNonEmptyString(value.url)) {
      throw new Error(`Manifest ${manifestPath} target '${target}' missing non-empty 'url'.`)
    }
    if (!isNonEmptyString(value.signature)) {
      throw new Error(
        `Manifest ${manifestPath} target '${target}' missing non-empty 'signature'.`
      )
    }
  }

  console.log(`Updater manifest is valid: ${manifestPath}`)
}

main()

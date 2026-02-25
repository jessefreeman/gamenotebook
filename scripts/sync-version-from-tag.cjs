#!/usr/bin/env node

"use strict"

const fs = require("node:fs")
const path = require("node:path")

function parseArgs(argv) {
  let tag = null
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--tag") {
      tag = argv[i + 1] || null
      i += 1
      continue
    }
    if (arg.startsWith("--tag=")) {
      tag = arg.slice("--tag=".length)
      continue
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/sync-version-from-tag.cjs --tag v<major>.<minor>.<patch>")
      process.exit(0)
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return tag
}

function extractVersion(tagValue) {
  const raw = String(tagValue || "").trim()
  const normalized = raw.startsWith("v") ? raw.slice(1) : raw
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(normalized)) {
    throw new Error(
      `Invalid tag/version '${raw}'. Expected v<major>.<minor>.<patch> or <major>.<minor>.<patch>.`
    )
  }
  return normalized
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8")
}

function main() {
  const argTag = parseArgs(process.argv.slice(2))
  const tag = argTag || process.env.TAG_VERSION || process.env.GITHUB_REF_NAME
  if (!tag) {
    throw new Error("Missing tag input. Provide --tag, TAG_VERSION, or GITHUB_REF_NAME.")
  }

  const version = extractVersion(tag)
  const rootDir = path.resolve(__dirname, "..")
  const packageJsonPath = path.join(rootDir, "package.json")
  const tauriConfigPath = path.join(rootDir, "src-tauri", "tauri.conf.json")

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
  const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, "utf8"))

  let updatedCount = 0

  if (packageJson.version !== version) {
    packageJson.version = version
    writeJsonFile(packageJsonPath, packageJson)
    updatedCount += 1
  }

  if (!tauriConfig.package) {
    tauriConfig.package = {}
  }
  if (tauriConfig.package.version !== version) {
    tauriConfig.package.version = version
    writeJsonFile(tauriConfigPath, tauriConfig)
    updatedCount += 1
  }

  console.log(
    updatedCount > 0
      ? `Synced package versions to ${version} from tag ${tag}.`
      : `Versions already synced to ${version}.`
  )
}

main()

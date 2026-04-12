#!/usr/bin/env node

"use strict"

const fs = require("node:fs")
const path = require("node:path")

function usage() {
  console.log(`Usage:
  node scripts/generate-updater-manifest.cjs --artifacts-dir <dir> --repo <owner/repo> --version <tag> [--output <file>] [--notes <text>] [--require-artifacts]

Options:
  --artifacts-dir   Directory containing release artifacts.
  --repo            GitHub repository slug (for example, jessefreeman/gamenotebook).
  --version         Release tag name (for example, v0.3.0).
  --output          Output file path. Defaults to <artifacts-dir>/latest.json.
  --notes           Optional notes value to embed in manifest.
  --require-artifacts  Fail if no updater artifacts are found.`)
}

function parseArgs(argv) {
  const options = {
    artifactsDir: null,
    repo: null,
    version: null,
    output: null,
    notes: null,
    requireArtifacts: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--help" || arg === "-h") {
      usage()
      process.exit(0)
    }

    if (arg === "--artifacts-dir") {
      options.artifactsDir = argv[i + 1] || null
      i += 1
      continue
    }
    if (arg.startsWith("--artifacts-dir=")) {
      options.artifactsDir = arg.slice("--artifacts-dir=".length)
      continue
    }

    if (arg === "--repo") {
      options.repo = argv[i + 1] || null
      i += 1
      continue
    }
    if (arg.startsWith("--repo=")) {
      options.repo = arg.slice("--repo=".length)
      continue
    }

    if (arg === "--version") {
      options.version = argv[i + 1] || null
      i += 1
      continue
    }
    if (arg.startsWith("--version=")) {
      options.version = arg.slice("--version=".length)
      continue
    }

    if (arg === "--output") {
      options.output = argv[i + 1] || null
      i += 1
      continue
    }
    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length)
      continue
    }

    if (arg === "--notes") {
      options.notes = argv[i + 1] || null
      i += 1
      continue
    }
    if (arg.startsWith("--notes=")) {
      options.notes = arg.slice("--notes=".length)
      continue
    }

    if (arg === "--require-artifacts") {
      options.requireArtifacts = true
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!options.artifactsDir || !options.repo || !options.version) {
    throw new Error(
      "Missing required options: --artifacts-dir, --repo, and --version are all required."
    )
  }

  if (!options.output) {
    options.output = path.join(options.artifactsDir, "latest.json")
  }

  return options
}

function normalizeManifestVersion(value) {
  const raw = String(value || "").trim()
  const normalized = raw.startsWith("v") ? raw.slice(1) : raw
  if (!/^[0-9]+\.[0-9]+(\.[0-9]+)?(-dev\.[0-9]+)?$/.test(normalized)) {
    throw new Error(
      `Invalid --version value '${value}'. Expected v<major>.<minor>[.<patch>][-dev.<n>] or <major>.<minor>[.<patch>][-dev.<n>].`
    )
  }
  const [versionPart, prereleasePart] = normalized.split("-")
  const versionParts = versionPart.split(".")
  if (versionParts.length === 2) {
    const semver = `${versionParts[0]}.${versionParts[1]}.0`
    return prereleasePart ? `${semver}-${prereleasePart}` : semver
  }
  return normalized
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const artifactsDir = path.resolve(options.artifactsDir)
  const manifestVersion = normalizeManifestVersion(options.version)

  if (!fs.existsSync(artifactsDir)) {
    throw new Error(`Artifacts directory does not exist: ${artifactsDir}`)
  }

  const updaterArchivePattern = /^.+_updater_([a-z0-9]+-[a-z0-9_]+)\.(tar\.gz|zip)$/i
  const artifactNames = fs
    .readdirSync(artifactsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))

  const platforms = {}

  for (const artifactName of artifactNames) {
    const match = artifactName.match(updaterArchivePattern)
    if (!match) continue

    const target = match[1]
    const signatureName = `${artifactName}.sig`
    const signaturePath = path.join(artifactsDir, signatureName)
    if (!fs.existsSync(signaturePath)) {
      throw new Error(`Missing updater signature artifact: ${signatureName}`)
    }

    const signature = fs.readFileSync(signaturePath, "utf8").trim()
    if (!signature) {
      throw new Error(`Updater signature file is empty: ${signatureName}`)
    }

    platforms[target] = {
      signature,
      url: `https://github.com/${options.repo}/releases/download/${options.version}/${encodeURIComponent(
        artifactName
      )}`,
    }
  }

  const platformKeys = Object.keys(platforms).sort((a, b) => a.localeCompare(b))
  if (platformKeys.length === 0) {
    if (options.requireArtifacts) {
      throw new Error(
        "No updater artifacts were found. Ensure updater signing is enabled and artifacts were uploaded."
      )
    }
    console.log("No updater artifacts found; skipping latest.json generation.")
    return
  }

  const manifest = {
    version: manifestVersion,
    notes: options.notes || `See GitHub release ${options.version} for full release notes.`,
    pub_date: new Date().toISOString(),
    platforms: platformKeys.reduce((all, target) => {
      all[target] = platforms[target]
      return all
    }, {}),
  }

  const outputPath = path.resolve(options.output)
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  console.log(`Generated updater manifest: ${outputPath}`)
}

main()

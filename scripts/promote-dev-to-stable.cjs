#!/usr/bin/env node

"use strict"

const { spawnSync } = require("node:child_process")
const path = require("node:path")

function usage() {
  console.log(`Usage:
  node scripts/promote-dev-to-stable.cjs --dev-tag <vX.Y.Z-dev.N> [--stable-tag <vX.Y.Z>] [--push]

Examples:
  node scripts/promote-dev-to-stable.cjs --dev-tag v1.4.0-dev.2
  node scripts/promote-dev-to-stable.cjs --dev-tag v1.4.0-dev.2 --push`)
}

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    stdio: capture ? "pipe" : "inherit",
    encoding: capture ? "utf8" : undefined,
  })
  if (result.error) {
    throw new Error(`Failed to run '${command} ${args.join(" ")}': ${result.error.message}`)
  }
  if (result.status !== 0) {
    const stderr = capture ? String(result.stderr || "").trim() : ""
    throw new Error(
      `Command failed (${result.status}): ${command} ${args.join(" ")}${
        stderr ? `\n${stderr}` : ""
      }`
    )
  }
  return capture ? String(result.stdout || "").trim() : ""
}

function parseArgs(argv) {
  const options = {
    devTag: null,
    stableTag: null,
    push: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--help" || arg === "-h") {
      usage()
      process.exit(0)
    }
    if (arg === "--dev-tag") {
      options.devTag = argv[i + 1] || null
      i += 1
      continue
    }
    if (arg.startsWith("--dev-tag=")) {
      options.devTag = arg.slice("--dev-tag=".length)
      continue
    }
    if (arg === "--stable-tag") {
      options.stableTag = argv[i + 1] || null
      i += 1
      continue
    }
    if (arg.startsWith("--stable-tag=")) {
      options.stableTag = arg.slice("--stable-tag=".length)
      continue
    }
    if (arg === "--push") {
      options.push = true
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!options.devTag) {
    throw new Error("Missing --dev-tag.")
  }

  return options
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const rootDir = path.resolve(__dirname, "..")
  process.chdir(rootDir)

  const devMatch = options.devTag.match(/^v([0-9]+\.[0-9]+\.[0-9]+)-dev\.[0-9]+$/)
  if (!devMatch) {
    throw new Error("Invalid --dev-tag format. Expected vX.Y.Z-dev.N")
  }
  const stableTag = options.stableTag || `v${devMatch[1]}`
  if (!/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(stableTag)) {
    throw new Error("Invalid --stable-tag format. Expected vX.Y.Z")
  }

  const existingStableTag = run("git", ["tag", "--list", stableTag], true)
  if (existingStableTag.split(/\r?\n/).some((line) => line.trim() === stableTag)) {
    throw new Error(`Stable tag already exists: ${stableTag}`)
  }

  run("git", ["fetch", "--tags", "origin"])
  const targetCommit = run("git", ["rev-list", "-n", "1", options.devTag], true)
  if (!targetCommit) {
    throw new Error(`Could not resolve commit for dev tag ${options.devTag}`)
  }

  run("git", ["tag", "-a", stableTag, targetCommit, "-m", `Promote ${options.devTag} to ${stableTag}`])

  if (options.push) {
    run("git", ["push", "origin", stableTag])
  }

  console.log("")
  console.log("Dev promotion complete:")
  console.log(`- Source dev tag: ${options.devTag}`)
  console.log(`- Stable tag: ${stableTag}`)
  console.log(`- Commit: ${targetCommit}`)
  console.log(`- Push performed: ${options.push ? "yes" : "no"}`)
}

main()

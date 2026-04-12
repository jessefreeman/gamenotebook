#!/usr/bin/env node

"use strict"

const { spawnSync } = require("node:child_process")
const path = require("node:path")

function usage() {
  console.log(`Usage:
  node scripts/release-next-tag.cjs --level <minor|major> [--channel <stable|dev>] [--push] [--main <branch>] [--source <branch>] [--tag-style <short|full>]

Examples:
  node scripts/release-next-tag.cjs --level minor
  node scripts/release-next-tag.cjs --level major --push

Notes:
  - short tag style creates tags like v1.4 (default).
  - full tag style creates tags like v1.4.0.
  - dev channel tags are always vX.Y.Z-dev.N.
  - app/package versions are always normalized to semver (for example 1.4.0).`)
}

function parseArgs(argv) {
  const options = {
    level: null,
    push: false,
    channel: "stable",
    mainBranch: "main",
    sourceBranch: null,
    tagStyle: "short",
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--help" || arg === "-h") {
      usage()
      process.exit(0)
    }

    if (arg === "--level") {
      options.level = argv[i + 1] || null
      i += 1
      continue
    }
    if (arg.startsWith("--level=")) {
      options.level = arg.slice("--level=".length)
      continue
    }
    if (arg === "--major") {
      options.level = "major"
      continue
    }
    if (arg === "--minor") {
      options.level = "minor"
      continue
    }
    if (arg === "--push") {
      options.push = true
      continue
    }
    if (arg === "--channel") {
      options.channel = argv[i + 1] || null
      i += 1
      continue
    }
    if (arg.startsWith("--channel=")) {
      options.channel = arg.slice("--channel=".length)
      continue
    }
    if (arg === "--main") {
      options.mainBranch = argv[i + 1] || null
      i += 1
      continue
    }
    if (arg.startsWith("--main=")) {
      options.mainBranch = arg.slice("--main=".length)
      continue
    }
    if (arg === "--source") {
      options.sourceBranch = argv[i + 1] || null
      i += 1
      continue
    }
    if (arg.startsWith("--source=")) {
      options.sourceBranch = arg.slice("--source=".length)
      continue
    }
    if (arg === "--tag-style") {
      options.tagStyle = argv[i + 1] || null
      i += 1
      continue
    }
    if (arg.startsWith("--tag-style=")) {
      options.tagStyle = arg.slice("--tag-style=".length)
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (options.level !== "major" && options.level !== "minor") {
    throw new Error("Missing or invalid --level. Use --level major or --level minor.")
  }
  if (!options.mainBranch) {
    throw new Error("Missing --main branch value.")
  }
  if (options.channel !== "stable" && options.channel !== "dev") {
    throw new Error("Invalid --channel. Use stable or dev.")
  }
  if (options.tagStyle !== "short" && options.tagStyle !== "full") {
    throw new Error("Invalid --tag-style. Use short or full.")
  }

  return options
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? "pipe" : "inherit",
    encoding: options.capture ? "utf8" : undefined,
  })

  if (result.error) {
    throw new Error(`Failed to run '${command} ${args.join(" ")}': ${result.error.message}`)
  }

  if (result.status !== 0) {
    const stderr = options.capture ? String(result.stderr || "").trim() : ""
    const details = stderr ? `\n${stderr}` : ""
    throw new Error(
      `Command failed with exit code ${result.status}: ${command} ${args.join(" ")}${details}`
    )
  }

  return options.capture ? String(result.stdout || "").trim() : ""
}

function parseTagVersion(tag) {
  const match = String(tag || "")
    .trim()
    .match(/^v([0-9]+)\.([0-9]+)(?:\.([0-9]+))?(?:-dev\.([0-9]+))?$/)
  if (!match) return null
  return {
    tag,
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3] || "0", 10),
    dev: match[4] ? Number.parseInt(match[4], 10) : null,
  }
}

function compareVersions(left, right) {
  if (left.major !== right.major) return left.major - right.major
  if (left.minor !== right.minor) return left.minor - right.minor
  return left.patch - right.patch
}

function getLatestStableVersion(parsedVersions) {
  const stable = parsedVersions.filter((item) => item.dev === null)
  if (stable.length === 0) {
    return {
      tag: "v0.0.0",
      major: 0,
      minor: 0,
      patch: 0,
      dev: null,
    }
  }
  stable.sort(compareVersions)
  return stable[stable.length - 1]
}

function getAllReleaseVersions() {
  const tagsRaw = run("git", ["tag", "--list", "v*"], { capture: true })
  return tagsRaw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseTagVersion)
    .filter(Boolean)
}

function formatTag(version, tagStyle) {
  if (tagStyle === "full") {
    return `v${version.major}.${version.minor}.${version.patch}`
  }
  return `v${version.major}.${version.minor}`
}

function formatDevTag(version, devNumber) {
  return `v${version.major}.${version.minor}.${version.patch}-dev.${devNumber}`
}

function assertCleanWorktree() {
  const status = run("git", ["status", "--porcelain"], { capture: true })
  if (status) {
    throw new Error(
      "Working tree is not clean. Commit or stash local changes before running release automation."
    )
  }
}

function getCurrentBranchName() {
  const branch = run("git", ["branch", "--show-current"], { capture: true })
  if (!branch) {
    throw new Error("Unable to determine current branch (detached HEAD is not supported).")
  }
  return branch
}

function hasTag(tag) {
  const output = run("git", ["tag", "--list", tag], { capture: true })
  return output.split(/\r?\n/).some((line) => line.trim() === tag)
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const rootDir = path.resolve(__dirname, "..")
  process.chdir(rootDir)

  assertCleanWorktree()
  const initialBranch = getCurrentBranchName()
  const sourceBranch = options.sourceBranch || initialBranch

  run("git", ["fetch", "--tags", "origin", options.mainBranch])

  if (initialBranch !== sourceBranch) {
    run("git", ["checkout", sourceBranch])
    assertCleanWorktree()
  }

  run("git", ["checkout", options.mainBranch])
  run("git", ["pull", "--ff-only", "origin", options.mainBranch])

  if (sourceBranch !== options.mainBranch) {
    run("git", [
      "merge",
      "--no-ff",
      sourceBranch,
      "-m",
      `chore(release): merge ${sourceBranch} into ${options.mainBranch}`,
    ])
  }

  const allVersions = getAllReleaseVersions()
  const currentStable = getLatestStableVersion(allVersions)
  const nextBase =
    options.level === "major"
      ? { major: currentStable.major + 1, minor: 0, patch: 0 }
      : { major: currentStable.major, minor: currentStable.minor + 1, patch: 0 }

  const nextTag =
    options.channel === "stable"
      ? formatTag(nextBase, options.tagStyle)
      : (() => {
          const existingForBase = allVersions
            .filter(
              (item) =>
                item.major === nextBase.major &&
                item.minor === nextBase.minor &&
                item.patch === nextBase.patch &&
                item.dev !== null
            )
            .map((item) => item.dev)
            .filter((value) => typeof value === "number")
          const nextDevNumber =
            existingForBase.length === 0 ? 1 : Math.max(...existingForBase) + 1
          return formatDevTag(nextBase, nextDevNumber)
        })()

  if (hasTag(nextTag)) {
    throw new Error(`Tag ${nextTag} already exists.`)
  }

  run("node", ["scripts/sync-version-from-tag.cjs", "--tag", nextTag])
  run("git", ["add", "package.json", "src-tauri/tauri.conf.json"])

  const hasStagedChanges = spawnSync("git", ["diff", "--cached", "--quiet"]).status !== 0
  if (hasStagedChanges) {
    run("git", ["commit", "-m", `chore(release): ${nextTag}`])
  }

  run("git", ["tag", "-a", nextTag, "-m", `Release ${nextTag}`])

  if (options.push) {
    run("git", ["push", "origin", options.mainBranch])
    run("git", ["push", "origin", nextTag])
  }

  console.log("")
  console.log("Release preparation complete:")
  console.log(`- Channel: ${options.channel}`)
  console.log(`- Source branch: ${sourceBranch}`)
  console.log(`- Main branch: ${options.mainBranch}`)
  console.log(
    `- Previous stable version: v${currentStable.major}.${currentStable.minor}.${currentStable.patch}`
  )
  console.log(`- New tag: ${nextTag}`)
  console.log(`- Push performed: ${options.push ? "yes" : "no"}`)
}

main()

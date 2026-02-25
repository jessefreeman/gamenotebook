#!/usr/bin/env node

const fs = require("fs")
const path = require("path")

const workflowPath = path.join(
  process.cwd(),
  ".github",
  "workflows",
  "tag-release-builds.yml"
)
const workflow = fs.readFileSync(workflowPath, "utf8")
const packageJsonPath = path.join(process.cwd(), "package.json")
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
const scripts = packageJson.scripts || {}

const failures = []

const requireSnippet = (snippet, message) => {
  if (!workflow.includes(snippet)) {
    failures.push(message)
  }
}

const requireScript = (name, expectedSnippet, message) => {
  const script = scripts[name]
  if (!script || !script.includes(expectedSnippet)) {
    failures.push(message)
  }
}

const requireOrder = (source, first, second, message) => {
  const firstIndex = source.indexOf(first)
  const secondIndex = source.indexOf(second)
  if (firstIndex === -1 || secondIndex === -1 || firstIndex >= secondIndex) {
    failures.push(message)
  }
}

const buildBlockStart = workflow.indexOf("  build:")
const buildBlockEnd = workflow.indexOf("\n  release:")
const buildBlock =
  buildBlockStart === -1
    ? ""
    : buildBlockEnd === -1
      ? workflow.slice(buildBlockStart)
      : workflow.slice(buildBlockStart, buildBlockEnd)

if (!buildBlock) {
  failures.push("Missing build job block.")
}

requireSnippet('tags:\n      - "v*"', "Tag trigger must be restricted to v*.")
requireSnippet("preflight:", "Missing preflight job.")
requireSnippet("needs: preflight", "Build job must depend on preflight.")
requireSnippet(
  "^v[0-9]+\\.[0-9]+\\.[0-9]+$",
  "Preflight must validate semantic version tag format."
)
requireSnippet(
  "fetch-depth: 0",
  "Preflight checkout must fetch full history for branch ancestry checks."
)
requireSnippet(
  "git merge-base --is-ancestor \"${GITHUB_SHA}\" \"origin/main\"",
  "Preflight must verify the tagged commit is on origin/main history."
)
requireSnippet(
  "require('./src-tauri/tauri.conf.json').package.version",
  "Preflight must validate tag version against src-tauri/tauri.conf.json."
)
requireOrder(
  buildBlock,
  "- name: Setup pnpm",
  "- name: Setup Node.js",
  "Setup pnpm must run before Setup Node.js in the build job."
)
requireSnippet(
  "cache-dependency-path: pnpm-lock.yaml",
  "Setup Node.js must include cache-dependency-path: pnpm-lock.yaml."
)
requireSnippet(
  "run: pnpm build:release -- --platform ${{ matrix.platform.name }}",
  "Build step must call the local release command with the matrix platform."
)
requireSnippet(
  "Build and package release artifacts",
  "Missing build-and-package step in the build job."
)
requireSnippet(
  "if-no-files-found: error",
  "Upload artifact steps must fail when no files are found."
)
if (workflow.includes("collect-release-package-files.cjs")) {
  failures.push("Workflow must not call scripts/collect-release-package-files.cjs directly.")
}
requireSnippet(
  "release:\n    name: Publish GitHub release",
  "Missing release publish job."
)
requireSnippet("needs: build", "Release job must depend on build.")
requireSnippet(
  "uses: actions/download-artifact@v4",
  "Release job must download build artifacts."
)
requireSnippet(
  "files: release-artifacts/*",
  "Release job must publish artifacts downloaded from build jobs."
)

requireScript(
  "build:release",
  "scripts/build-release-artifacts.cjs",
  "package.json must define build:release using scripts/build-release-artifacts.cjs."
)
requireScript(
  "build:release:macos",
  "--platform macos",
  "package.json must define build:release:macos with --platform macos."
)
requireScript(
  "build:release:windows",
  "--platform windows",
  "package.json must define build:release:windows with --platform windows."
)
requireScript(
  "build:release:linux",
  "--platform linux",
  "package.json must define build:release:linux with --platform linux."
)

if (failures.length > 0) {
  console.error("Release workflow guard failed:")
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log("Release workflow guard passed.")

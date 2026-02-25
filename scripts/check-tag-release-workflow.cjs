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

const failures = []

const requireSnippet = (snippet, message) => {
  if (!workflow.includes(snippet)) {
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
  "run: pnpm exec tauri build --config src-tauri/tauri.conf.ci.json",
  "Build command must use the CI Tauri config."
)
requireSnippet(
  "if-no-files-found: error",
  "Upload artifact steps must fail when no files are found."
)
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

if (failures.length > 0) {
  console.error("Release workflow guard failed:")
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log("Release workflow guard passed.")

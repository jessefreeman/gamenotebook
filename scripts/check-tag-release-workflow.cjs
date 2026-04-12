#!/usr/bin/env node

"use strict"

const fs = require("node:fs")
const path = require("node:path")

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

function requireSnippet(snippet, message) {
  if (!workflow.includes(snippet)) {
    failures.push(message)
  }
}

function requireCountAtLeast(snippet, count, message) {
  const occurrences = workflow.split(snippet).length - 1
  if (occurrences < count) {
    failures.push(message)
  }
}

function requireScript(scriptName, expectedSnippet, message) {
  const value = scripts[scriptName]
  if (!value || !value.includes(expectedSnippet)) {
    failures.push(message)
  }
}

requireSnippet('tags:\n      - "v*"', "Tag trigger must be restricted to v*.")
requireSnippet("id-token: write", "Workflow permissions must include id-token: write.")
requireSnippet("preflight:", "Missing preflight job.")
requireSnippet("build:", "Missing build job.")
requireSnippet(
  "^v[0-9]+\\.[0-9]+(\\.[0-9]+)?(-dev\\.[0-9]+)?$",
  "Preflight must validate semantic version tag format including optional -dev.<n> prerelease."
)
requireSnippet(
  "git merge-base --is-ancestor \"${GITHUB_SHA}\" \"origin/main\"",
  "Preflight must verify the tagged commit is on origin/main history."
)
requireSnippet(
  "channel: ${{ steps.release_meta.outputs.channel }}",
  "Preflight must expose derived release channel output."
)
requireSnippet(
  "Azure login (OIDC)",
  "Workflow must authenticate to Azure with OIDC."
)
requireCountAtLeast(
  "scripts/fetch-signing-secrets-from-azure.cjs",
  2,
  "Workflow must fetch signing secrets from Azure Key Vault in preflight and build jobs."
)
requireSnippet(
  "scripts/sync-version-from-tag.cjs --tag ${{ github.ref_name }}",
  "Workflow must sync app versions from the release tag."
)
requireCountAtLeast(
  "Sync app versions from tag",
  2,
  "Workflow must sync app versions in both preflight and build jobs."
)
requireSnippet(
  "ENABLE_UPDATER_ARTIFACTS: \"1\"",
  "Build step must force updater artifact generation."
)
requireSnippet(
  "scripts/macos-notarize-and-verify.cjs",
  "Workflow must notarize and verify macOS artifacts."
)
requireSnippet(
  "azure/trusted-signing-action@v0.5.9",
  "Workflow must trusted-sign Windows artifacts with Azure Trusted Signing."
)
requireSnippet(
  "scripts/windows-verify-signatures.ps1",
  "Workflow must verify Windows Authenticode signatures."
)
requireSnippet(
  "--require-os-signatures",
  "Artifact checks for signed platforms must require OS signing reports."
)
requireSnippet(
  "if: needs.preflight.result == 'success' && needs.build.result == 'success'",
  "Release publish job must require successful preflight and build jobs."
)
requireSnippet(
  "scripts/generate-updater-manifest.cjs",
  "Release job must generate updater manifests."
)
requireSnippet(
  "scripts/validate-updater-manifest.cjs",
  "Release job must validate updater manifests."
)
requireSnippet(
  "macos-signing-report.json",
  "Smoke checks must validate macOS signing report asset."
)
requireSnippet(
  "windows-signing-report.json",
  "Smoke checks must validate Windows signing report asset."
)

requireScript(
  "build:release",
  "scripts/build-release-artifacts.cjs",
  "package.json must define build:release using build-release-artifacts.cjs."
)
requireScript(
  "release:check:certified-ready",
  "scripts/check-certified-release-readiness.cjs",
  "package.json must define release:check:certified-ready."
)
requireScript(
  "release:set:github-vars",
  "scripts/set-certified-release-github-vars.sh",
  "package.json must define release:set:github-vars."
)
requireScript(
  "release:fetch:azure-secrets",
  "scripts/fetch-signing-secrets-from-azure.cjs",
  "package.json must define release:fetch:azure-secrets."
)
requireScript(
  "release:macos:notarize",
  "scripts/macos-notarize-and-verify.cjs",
  "package.json must define release:macos:notarize."
)
requireScript(
  "release:verify:windows-signatures",
  "scripts/windows-verify-signatures.ps1",
  "package.json must define release:verify:windows-signatures."
)
requireScript(
  "release:minor",
  "scripts/release-next-tag.cjs --level minor",
  "package.json must define release:minor with release-next-tag automation."
)
requireScript(
  "release:major",
  "scripts/release-next-tag.cjs --level major",
  "package.json must define release:major with release-next-tag automation."
)
requireScript(
  "release:dev:minor",
  "scripts/release-next-tag.cjs --level minor --channel dev",
  "package.json must define release:dev:minor for dev channel tags."
)
requireScript(
  "release:promote:dev",
  "scripts/promote-dev-to-stable.cjs",
  "package.json must define release:promote:dev for dev-to-stable promotion."
)
requireScript(
  "updater:gateway:dev",
  "scripts/update-gateway-server.cjs",
  "package.json must define updater:gateway:dev."
)

if (failures.length > 0) {
  console.error("Release workflow guard failed:")
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log("Release workflow guard passed.")

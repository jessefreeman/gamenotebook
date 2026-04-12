#!/usr/bin/env node

"use strict"

const fs = require("node:fs")
const path = require("node:path")

function usage() {
  console.log(`Usage:
  node scripts/check-release-artifacts.cjs --dir <release-files> --platform <macos|windows|linux> [--require-updater] [--require-os-signatures]

Checks that expected installer artifacts, updater artifacts, and optional OS signing receipts are present.`)
}

function parseArgs(argv) {
  const options = {
    dir: null,
    platform: null,
    requireUpdater: false,
    requireOsSignatures: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--help" || arg === "-h") {
      usage()
      process.exit(0)
    }
    if (arg === "--dir") {
      options.dir = argv[i + 1] || null
      i += 1
      continue
    }
    if (arg.startsWith("--dir=")) {
      options.dir = arg.slice("--dir=".length)
      continue
    }
    if (arg === "--platform") {
      options.platform = argv[i + 1] || null
      i += 1
      continue
    }
    if (arg.startsWith("--platform=")) {
      options.platform = arg.slice("--platform=".length)
      continue
    }
    if (arg === "--require-updater") {
      options.requireUpdater = true
      continue
    }
    if (arg === "--require-os-signatures") {
      options.requireOsSignatures = true
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  if (!options.dir || !options.platform) {
    throw new Error("Missing required --dir and --platform options.")
  }
  if (!["macos", "windows", "linux"].includes(options.platform)) {
    throw new Error("Invalid --platform. Use macos, windows, or linux.")
  }
  return options
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const dir = path.resolve(options.dir)
  const names = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((x) => x.isFile())
    .map((x) => x.name)

  const checks = []
  if (options.platform === "macos") {
    checks.push((n) => n.endsWith("_macos.dmg"))
  } else if (options.platform === "windows") {
    checks.push((n) => n.endsWith("_windows_standalone.exe"))
    checks.push((n) => n.includes("_windows_installer") && n.endsWith(".msi"))
  } else {
    checks.push((n) => /_linux.*\.(AppImage|deb|rpm)$/.test(n))
  }

  for (const hasMatch of checks) {
    if (!names.some(hasMatch)) {
      throw new Error(
        `Missing expected ${options.platform} installer artifact in ${dir}. Found: ${names.join(", ")}`
      )
    }
  }

  if (options.requireUpdater) {
    const prefix =
      options.platform === "macos"
        ? "_updater_darwin-"
        : options.platform === "windows"
          ? "_updater_windows-"
          : "_updater_linux-"
    const updater = names.find((n) => n.includes(prefix) && !n.endsWith(".sig"))
    if (!updater) {
      throw new Error(
        `Missing updater bundle for ${options.platform} in ${dir}. Found: ${names.join(", ")}`
      )
    }
    const sig = `${updater}.sig`
    if (!names.includes(sig)) {
      throw new Error(`Missing updater signature for ${updater}`)
    }
  }

  if (options.requireOsSignatures) {
    if (options.platform === "macos") {
      const reportName = "macos-signing-report.json"
      if (!names.includes(reportName)) {
        throw new Error(`Missing macOS signing report: ${reportName}`)
      }
      const reportPath = path.join(dir, reportName)
      const report = JSON.parse(fs.readFileSync(reportPath, "utf8"))
      const checks = report && report.checks ? report.checks : {}
      if (
        report.passed !== true ||
        checks.codesignVerified !== true ||
        checks.appSpctlVerified !== true ||
        checks.stapled !== true ||
        checks.staplerValidated !== true ||
        checks.dmgSpctlVerified !== true
      ) {
        throw new Error(`macOS signing report did not pass all checks: ${reportPath}`)
      }
    } else if (options.platform === "windows") {
      const reportName = "windows-signing-report.json"
      if (!names.includes(reportName)) {
        throw new Error(`Missing Windows signing report: ${reportName}`)
      }
      const reportPath = path.join(dir, reportName)
      const report = JSON.parse(fs.readFileSync(reportPath, "utf8"))
      const files = Array.isArray(report.files) ? report.files : []
      if (report.passed !== true || files.length === 0) {
        throw new Error(`Windows signing report is missing valid file checks: ${reportPath}`)
      }
      const invalid = files.find((entry) => String(entry.status || "").toLowerCase() !== "valid")
      if (invalid) {
        throw new Error(`Windows signing report contains invalid signature status for ${invalid.file}`)
      }
    }
  }

  console.log(`Release artifact check passed for ${options.platform}: ${dir}`)
}

main()

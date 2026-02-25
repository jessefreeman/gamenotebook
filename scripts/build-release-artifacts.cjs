#!/usr/bin/env node

"use strict"

const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const VALID_PLATFORMS = new Set(["macos", "windows", "linux"])

const BUNDLES_BY_PLATFORM = {
  macos: "app",
  windows: "msi",
  linux: "appimage,deb",
}

function usage() {
  console.log(`Usage:
  node scripts/build-release-artifacts.cjs [--platform <macos|windows|linux>] [--skip-build]

Options:
  --platform, -p  Target platform. Defaults to current OS.
  --skip-build    Skip tauri build and only collect/package artifacts.
  --help, -h      Show this help message.`)
}

function run(command, args, options = {}) {
  const useShell = process.platform === "win32"
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: options.cwd,
    env: options.env,
    shell: useShell,
  })

  const cmd = [command, ...args].join(" ")
  if (result.error) {
    throw new Error(`Failed to start command: ${cmd}\n${result.error.message}`)
  }

  if (result.status !== 0) {
    const exitDetails =
      result.status === null
        ? result.signal
          ? `signal ${result.signal}`
          : "unknown"
        : `exit ${result.status}`
    throw new Error(`Command failed (${exitDetails}): ${cmd}`)
  }
}

function getPnpmCommand() {
  return "pnpm"
}

function normalizePlatform(value) {
  if (!value) return null
  const normalized = String(value).toLowerCase()
  if (["mac", "macos", "darwin", "osx"].includes(normalized)) return "macos"
  if (["win", "win32", "windows"].includes(normalized)) return "windows"
  if (normalized === "linux") return "linux"
  return null
}

function detectPlatform() {
  const host = process.platform
  if (host === "darwin") return "macos"
  if (host === "win32") return "windows"
  if (host === "linux") return "linux"
  throw new Error(`Unsupported host platform: ${host}`)
}

function sanitizeFileComponent(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "")
}

function walkFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkFiles(fullPath, files)
    } else if (entry.isFile()) {
      files.push(fullPath)
    }
  }
  return files
}

function copyArtifact(sourcePath, destinationPath) {
  fs.copyFileSync(sourcePath, destinationPath)
  console.log(`${sourcePath} -> ${destinationPath}`)
  return destinationPath
}

function snapshotFiles(filePaths) {
  return filePaths.map((filePath) => {
    const exists = fs.existsSync(filePath)
    return {
      filePath,
      exists,
      content: exists ? fs.readFileSync(filePath) : null,
    }
  })
}

function restoreFileSnapshots(snapshots) {
  for (const snapshot of snapshots) {
    if (!snapshot.exists) {
      if (fs.existsSync(snapshot.filePath)) {
        fs.rmSync(snapshot.filePath, { force: true })
      }
      continue
    }
    fs.writeFileSync(snapshot.filePath, snapshot.content)
  }
}

function parseArgs(argv) {
  const options = {
    platform: null,
    skipBuild: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--") {
      continue
    }

    if (arg === "--help" || arg === "-h") {
      usage()
      process.exit(0)
    }

    if (arg === "--skip-build") {
      options.skipBuild = true
      continue
    }

    if (arg === "--platform" || arg === "-p") {
      const value = argv[i + 1]
      if (!value) {
        throw new Error(`Missing value after ${arg}`)
      }
      options.platform = normalizePlatform(value)
      i += 1
      continue
    }

    if (arg.startsWith("--platform=")) {
      options.platform = normalizePlatform(arg.slice("--platform=".length))
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!options.platform) {
    options.platform = detectPlatform()
  }

  if (!VALID_PLATFORMS.has(options.platform)) {
    throw new Error(`Invalid platform: ${options.platform}`)
  }

  return options
}

function createCiConfig(baseConfigPath, releaseConfigPath) {
  const baseConfig = JSON.parse(fs.readFileSync(baseConfigPath, "utf8"))
  if (baseConfig?.tauri?.updater) {
    baseConfig.tauri.updater.active = false
  }
  if (baseConfig?.build) {
    // Avoid network-dependent npx bootstrap during release packaging.
    baseConfig.build.beforeBuildCommand = "pnpm build"
  }
  fs.writeFileSync(releaseConfigPath, `${JSON.stringify(baseConfig, null, 2)}\n`, "utf8")
}

function collectMacArtifacts({ bundleRoot, releaseFilesDir, artifactPrefix, productName }) {
  const macBundleDir = path.join(bundleRoot, "macos")
  if (!fs.existsSync(macBundleDir)) {
    throw new Error(`No macOS bundle directory found: ${macBundleDir}`)
  }

  const appDir = fs
    .readdirSync(macBundleDir, { withFileTypes: true })
    .find((entry) => entry.isDirectory() && entry.name.endsWith(".app"))

  if (!appDir) {
    throw new Error(`No .app bundle found in ${macBundleDir}`)
  }

  const appPath = path.join(macBundleDir, appDir.name)
  run("codesign", ["--force", "--deep", "--sign", "-", appPath])

  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), "gamenotebook-dmg-"))
  const stagedApp = path.join(stageDir, appDir.name)
  fs.cpSync(appPath, stagedApp, { recursive: true })
  fs.symlinkSync("/Applications", path.join(stageDir, "Applications"), "dir")

  const dmgPath = path.join(releaseFilesDir, `${artifactPrefix}_macos.dmg`)
  try {
    run("hdiutil", [
      "create",
      "-volname",
      productName,
      "-srcfolder",
      stageDir,
      "-ov",
      "-format",
      "UDZO",
      dmgPath,
    ])
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true })
  }

  return [dmgPath]
}

function findStandaloneExe(releaseDir, productName) {
  const candidates = [
    `${productName}.exe`,
    `${sanitizeFileComponent(productName)}.exe`,
    "GameNotebook.exe",
    "gamenotebook.exe",
  ]

  for (const candidate of candidates) {
    const absolute = path.join(releaseDir, candidate)
    if (fs.existsSync(absolute)) {
      return absolute
    }
  }

  const rootExes = fs
    .readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".exe"))
    .map((entry) => path.join(releaseDir, entry.name))

  if (rootExes.length === 1) {
    return rootExes[0]
  }

  if (rootExes.length > 1) {
    const bestMatch = rootExes.find((filePath) =>
      filePath.toLowerCase().includes(sanitizeFileComponent(productName).toLowerCase())
    )
    if (bestMatch) {
      return bestMatch
    }
  }

  throw new Error(`Could not locate standalone executable in ${releaseDir}`)
}

function copyWithIndexes(filePaths, destinationFactory) {
  return filePaths.map((sourcePath, index) => {
    const suffix = index === 0 ? "" : `_${index + 1}`
    const destination = destinationFactory(suffix)
    return copyArtifact(sourcePath, destination)
  })
}

function collectWindowsArtifacts({
  cargoTargetDir,
  bundleRoot,
  releaseFilesDir,
  artifactPrefix,
  productName,
}) {
  const discoveredFiles = walkFiles(bundleRoot)
  const msiFiles = discoveredFiles.filter((filePath) =>
    filePath.toLowerCase().endsWith(".msi")
  )
  const nsisExeFiles = discoveredFiles.filter((filePath) => {
    const lowerPath = filePath.toLowerCase()
    return lowerPath.endsWith(".exe") && lowerPath.includes(`${path.sep}nsis${path.sep}`)
  })

  if (msiFiles.length === 0) {
    throw new Error(`No Windows MSI installer found under ${bundleRoot}`)
  }

  const releaseDir = path.join(cargoTargetDir, "release")
  if (!fs.existsSync(releaseDir)) {
    throw new Error(`Windows release directory not found: ${releaseDir}`)
  }
  const standaloneExe = findStandaloneExe(releaseDir, productName)

  const outputs = []
  outputs.push(
    copyArtifact(
      standaloneExe,
      path.join(releaseFilesDir, `${artifactPrefix}_windows_standalone.exe`)
    )
  )

  outputs.push(
    ...copyWithIndexes(msiFiles, (suffix) =>
      path.join(releaseFilesDir, `${artifactPrefix}_windows_installer${suffix}.msi`)
    )
  )

  if (nsisExeFiles.length > 0) {
    outputs.push(
      ...copyWithIndexes(nsisExeFiles, (suffix) =>
        path.join(releaseFilesDir, `${artifactPrefix}_windows_installer${suffix}.exe`)
      )
    )
  }

  return outputs
}

function collectLinuxArtifacts({ bundleRoot, releaseFilesDir, artifactPrefix }) {
  const discoveredFiles = walkFiles(bundleRoot)
  const appImages = discoveredFiles.filter((filePath) =>
    filePath.toLowerCase().endsWith(".appimage")
  )
  const debs = discoveredFiles.filter((filePath) => filePath.toLowerCase().endsWith(".deb"))
  const rpms = discoveredFiles.filter((filePath) => filePath.toLowerCase().endsWith(".rpm"))

  const outputs = []

  outputs.push(
    ...copyWithIndexes(appImages, (suffix) =>
      path.join(releaseFilesDir, `${artifactPrefix}_linux${suffix}.AppImage`)
    )
  )
  outputs.push(
    ...copyWithIndexes(debs, (suffix) =>
      path.join(releaseFilesDir, `${artifactPrefix}_linux${suffix}.deb`)
    )
  )
  outputs.push(
    ...copyWithIndexes(rpms, (suffix) =>
      path.join(releaseFilesDir, `${artifactPrefix}_linux${suffix}.rpm`)
    )
  )

  if (outputs.length === 0) {
    throw new Error(`No Linux packages found under ${bundleRoot}`)
  }

  return outputs
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const hostPlatform = detectPlatform()
  const rootDir = path.resolve(__dirname, "..")
  const cargoTomlPath = path.join(rootDir, "src-tauri", "Cargo.toml")
  const cargoLockPath = path.join(rootDir, "src-tauri", "Cargo.lock")
  const tauriConfigPath = path.join(rootDir, "src-tauri", "tauri.conf.json")
  const ciConfigPath = path.join(rootDir, "src-tauri", "tauri.conf.ci.generated.json")
  const releaseFilesDir = path.join(rootDir, "release-files")
  const cargoTargetDir =
    process.env.CARGO_TARGET_DIR || path.join(os.tmpdir(), `gamenotebook-release-target-${options.platform}`)
  const clangModuleCachePath = path.join(cargoTargetDir, "clang-module-cache")
  const bundleRoot = path.join(cargoTargetDir, "release", "bundle")

  const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, "utf8"))
  const productName = tauriConfig?.package?.productName || "GameNotebook"
  const packageVersion = tauriConfig?.package?.version
  if (!packageVersion) {
    throw new Error(`Unable to read package.version from ${tauriConfigPath}`)
  }

  const rawReleaseVersion = process.env.RELEASE_VERSION || `v${packageVersion}`
  const releaseVersion = sanitizeFileComponent(rawReleaseVersion)
  const artifactPrefix = `${sanitizeFileComponent(productName)}_${releaseVersion}`

  if (options.platform !== hostPlatform && process.env.ALLOW_CROSS_PLATFORM !== "1") {
    throw new Error(
      `Requested platform (${options.platform}) does not match host (${hostPlatform}). ` +
        "Run this command on the target OS or set ALLOW_CROSS_PLATFORM=1 for explicit cross builds."
    )
  }

  console.log(`Building release artifacts for platform: ${options.platform}`)
  console.log(`Release version: ${releaseVersion}`)
  console.log(`CARGO_TARGET_DIR: ${cargoTargetDir}`)
  console.log(`CLANG_MODULE_CACHE_PATH: ${clangModuleCachePath}`)

  fs.rmSync(releaseFilesDir, { recursive: true, force: true })
  fs.mkdirSync(releaseFilesDir, { recursive: true })
  fs.mkdirSync(clangModuleCachePath, { recursive: true })
  const tauriMutableFileSnapshots = snapshotFiles([cargoTomlPath, cargoLockPath])

  createCiConfig(tauriConfigPath, ciConfigPath)

  try {
    if (!options.skipBuild) {
      const bundles = BUNDLES_BY_PLATFORM[options.platform]
      run(
        getPnpmCommand(),
        ["exec", "tauri", "build", "--config", ciConfigPath, "--bundles", bundles],
        {
          cwd: rootDir,
          env: {
            ...process.env,
            CARGO_TARGET_DIR: cargoTargetDir,
            CLANG_MODULE_CACHE_PATH: clangModuleCachePath,
          },
        }
      )
    }

    let outputs = []
    if (options.platform === "macos") {
      outputs = collectMacArtifacts({
        bundleRoot,
        releaseFilesDir,
        artifactPrefix,
        productName,
      })
    } else if (options.platform === "windows") {
      outputs = collectWindowsArtifacts({
        cargoTargetDir,
        bundleRoot,
        releaseFilesDir,
        artifactPrefix,
        productName,
      })
    } else {
      outputs = collectLinuxArtifacts({ bundleRoot, releaseFilesDir, artifactPrefix })
    }

    console.log("")
    console.log("Collected release artifacts:")
    for (const output of outputs) {
      console.log(`- ${output}`)
    }
  } finally {
    restoreFileSnapshots(tauriMutableFileSnapshots)
    fs.rmSync(ciConfigPath, { force: true })
  }
}

main()

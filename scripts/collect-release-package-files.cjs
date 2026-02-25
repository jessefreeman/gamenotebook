#!/usr/bin/env node

const fs = require("fs")
const path = require("path")

const releaseVersion = process.env.RELEASE_VERSION
const releaseOs = process.env.RELEASE_OS

if (!releaseVersion) {
  throw new Error("Missing RELEASE_VERSION environment variable.")
}

if (!releaseOs) {
  throw new Error("Missing RELEASE_OS environment variable.")
}

const bundleRoot = path.join("src-tauri", "target", "release", "bundle")
const outDir = "release-files"

const walkFiles = (dir, files = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkFiles(fullPath, files)
      continue
    }
    files.push(fullPath)
  }
  return files
}

const classifyFile = (filePath) => {
  const lowerName = path.basename(filePath).toLowerCase()

  if (releaseOs === "windows") {
    if (lowerName.endsWith(".msi")) {
      return { type: "msi", ext: ".msi" }
    }
    if (lowerName.endsWith(".exe")) {
      return { type: "installer", ext: ".exe" }
    }
    return null
  }

  if (releaseOs === "linux") {
    if (lowerName.endsWith(".deb")) {
      return { type: "deb", ext: ".deb" }
    }
    if (lowerName.endsWith(".appimage")) {
      return { type: "appimage", ext: ".AppImage" }
    }
    if (lowerName.endsWith(".rpm")) {
      return { type: "rpm", ext: ".rpm" }
    }
    return null
  }

  return null
}

if (!fs.existsSync(bundleRoot)) {
  throw new Error(`Bundle directory not found: ${bundleRoot}`)
}

const discoveredFiles = walkFiles(bundleRoot)
const matchingFiles = discoveredFiles
  .map((filePath) => ({
    filePath,
    info: classifyFile(filePath),
  }))
  .filter((item) => item.info !== null)

if (matchingFiles.length === 0) {
  const allFiles = discoveredFiles
    .map((filePath) => `- ${filePath}`)
    .join("\n")
    .trim()
  throw new Error(
    `No release package files found for ${releaseOs} under ${bundleRoot}.\nDiscovered files:\n${allFiles}`
  )
}

fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

const typeCounts = {}
for (const { filePath, info } of matchingFiles) {
  typeCounts[info.type] = (typeCounts[info.type] || 0) + 1
  const suffix = typeCounts[info.type] > 1 ? `_${typeCounts[info.type]}` : ""
  const outFileName = `GameNotebook_${releaseVersion}_${releaseOs}_${info.type}${suffix}${info.ext}`
  const destination = path.join(outDir, outFileName)
  fs.copyFileSync(filePath, destination)
  console.log(`${filePath} -> ${destination}`)
}

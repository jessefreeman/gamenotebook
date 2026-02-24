import { execSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import tauriConf from "../src-tauri/tauri.conf.json"

type TauriConfig = {
  package: {
    productName: string
    version: string
  }
}

function formatTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hour = pad(date.getHours())
  const minute = pad(date.getMinutes())
  const second = pad(date.getSeconds())
  return `${year}${month}${day}-${hour}${minute}${second}`
}

function findBuiltApp(bundleDir: string, expectedName: string): string {
  const expectedPath = path.join(bundleDir, `${expectedName}.app`)
  if (existsSync(expectedPath)) {
    return expectedPath
  }

  const appCandidate = readdirSync(bundleDir).find((entry) => entry.endsWith(".app"))
  if (!appCandidate) {
    throw new Error(`No .app bundle found in ${bundleDir}`)
  }

  return path.join(bundleDir, appCandidate)
}

const config = tauriConf as TauriConfig
const rootDir = path.resolve(__dirname, "..")
const productName = config.package.productName
const version = config.package.version
const timestamp = formatTimestamp(new Date())
const buildId = `${productName}_${version}_${timestamp}`
const buildRoot = path.join(rootDir, "artifacts", "macos")
const buildsDir = path.join(buildRoot, "builds")
const outputDir = path.join(buildsDir, buildId)
const outputAppPath = path.join(outputDir, `${productName}.app`)
const cargoTargetDir = `/tmp/gamenotebook-target-${timestamp}-${process.pid}`
const bundleDir = path.join(cargoTargetDir, "release", "bundle", "macos")

mkdirSync(buildsDir, { recursive: true })
mkdirSync(outputDir, { recursive: true })

try {
  execSync(`CARGO_TARGET_DIR="${cargoTargetDir}" npx -y pnpm@7 tauri build --bundles app`, {
    cwd: rootDir,
    stdio: "inherit",
  })

  const builtAppPath = findBuiltApp(bundleDir, productName)
  cpSync(builtAppPath, outputAppPath, { recursive: true })

  execSync(`codesign --force --deep --sign - "${outputAppPath}"`, {
    cwd: rootDir,
    stdio: "inherit",
  })

  const latestBuildIdPath = path.join(buildRoot, "LATEST_BUILD_ID.txt")
  const latestAppPathPath = path.join(buildRoot, "LATEST_APP_PATH.txt")

  writeFileSync(latestBuildIdPath, `${buildId}\n`, "utf8")
  writeFileSync(latestAppPathPath, `${outputAppPath}\n`, "utf8")

  console.log(`Build complete: ${outputAppPath}`)
} catch (error) {
  rmSync(outputDir, { recursive: true, force: true })
  throw error
}

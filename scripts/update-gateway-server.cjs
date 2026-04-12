#!/usr/bin/env node

"use strict"

const http = require("node:http")
const { URL } = require("node:url")

const OWNER = process.env.GITHUB_OWNER || "jessefreeman"
const REPO = process.env.GITHUB_REPO || "gamenotebook"
const PORT = Number.parseInt(process.env.PORT || "8787", 10)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ""
const USER_AGENT = process.env.UPDATER_GATEWAY_UA || "gamenotebook-updater-gateway/1.0"

const CHANNELS = new Set(["stable", "dev"])

function json(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  })
  res.end(body)
}

function noContent(res) {
  res.writeHead(204)
  res.end()
}

function parseTargetChannel(rawTarget) {
  const target = String(rawTarget || "").trim()
  if (!target) return { channel: "stable", platformTarget: "" }
  const [platformTarget, maybeChannel] = target.split("@")
  const channel = CHANNELS.has(maybeChannel) ? maybeChannel : "stable"
  return {
    channel,
    platformTarget: platformTarget || target,
  }
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": USER_AGENT,
      ...(GITHUB_TOKEN ? { authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
      ...headers,
    },
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`)
  }
  return response.json()
}

async function fetchText(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      accept: "application/octet-stream",
      "user-agent": USER_AGENT,
      ...(GITHUB_TOKEN ? { authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
      ...headers,
    },
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`)
  }
  return response.text()
}

function pickChannelRelease(releases, channel) {
  if (channel === "dev") {
    return releases.find(
      (release) =>
        !release.draft &&
        (release.prerelease || /-dev\.[0-9]+$/.test(String(release.tag_name || "")))
    )
  }

  return releases.find(
    (release) =>
      !release.draft &&
      !release.prerelease &&
      !/-dev\.[0-9]+$/.test(String(release.tag_name || ""))
  )
}

function manifestAssetName(channel) {
  return channel === "dev" ? "dev-latest.json" : "stable-latest.json"
}

function normalizeVersion(value) {
  const raw = String(value || "").trim()
  const normalized = raw.startsWith("v") ? raw.slice(1) : raw
  const match = normalized.match(/^(\d+)\.(\d+)(?:\.(\d+))?(?:-dev\.(\d+))?$/)
  if (!match) return null
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3] || "0", 10),
    dev: match[4] ? Number.parseInt(match[4], 10) : null,
  }
}

function compareVersions(left, right) {
  if (left.major !== right.major) return left.major - right.major
  if (left.minor !== right.minor) return left.minor - right.minor
  if (left.patch !== right.patch) return left.patch - right.patch
  const leftDev = left.dev === null ? Number.POSITIVE_INFINITY : left.dev
  const rightDev = right.dev === null ? Number.POSITIVE_INFINITY : right.dev
  return leftDev - rightDev
}

function isUpdateNewer(currentVersion, candidateVersion) {
  const current = normalizeVersion(currentVersion)
  const candidate = normalizeVersion(candidateVersion)
  if (!current || !candidate) return true
  return compareVersions(candidate, current) > 0
}

function buildDynamicResponse(manifest, platformTarget) {
  const platforms = manifest.platforms || {}
  const platform = platforms[platformTarget]
  if (!platform || typeof platform !== "object") {
    return null
  }
  if (!platform.url || !platform.signature) {
    return null
  }
  return {
    version: manifest.version,
    notes: manifest.notes || "",
    pub_date: manifest.pub_date,
    signature: platform.signature,
    url: platform.url,
  }
}

async function handleUpdater(req, res, url) {
  const incomingTarget = url.searchParams.get("target") || ""
  const currentVersion = url.searchParams.get("current_version") || ""
  const { channel, platformTarget } = parseTargetChannel(incomingTarget)

  const explicitChannel = url.searchParams.get("channel")
  const resolvedChannel =
    explicitChannel && CHANNELS.has(explicitChannel) ? explicitChannel : channel

  if (!platformTarget) {
    return json(res, 400, { error: "Missing updater target" })
  }

  const releases = await fetchJson(
    `https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=30`
  )
  const release = pickChannelRelease(releases, resolvedChannel)
  if (!release) {
    return noContent(res)
  }

  const manifestName = manifestAssetName(resolvedChannel)
  const manifestAsset = (release.assets || []).find((asset) => asset.name === manifestName)
  if (!manifestAsset) {
    return noContent(res)
  }

  const manifestText = await fetchText(manifestAsset.browser_download_url)
  const manifest = JSON.parse(manifestText)
  if (!isUpdateNewer(currentVersion, manifest.version)) {
    return noContent(res)
  }

  const payload = buildDynamicResponse(manifest, platformTarget)
  if (!payload) {
    return noContent(res)
  }

  return json(res, 200, payload)
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
    if (url.pathname === "/health") {
      return json(res, 200, {
        ok: true,
        owner: OWNER,
        repo: REPO,
      })
    }
    if (url.pathname !== "/updater") {
      return json(res, 404, { error: "Not found" })
    }
    return await handleUpdater(req, res, url)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown gateway error"
    return json(res, 500, { error: message })
  }
})

server.listen(PORT, () => {
  console.log(`Updater gateway listening on :${PORT}`)
  console.log(`Serving ${OWNER}/${REPO}`)
})

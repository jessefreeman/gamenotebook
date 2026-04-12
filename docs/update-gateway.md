# Update Gateway Service

`scripts/update-gateway-server.cjs` is the tiny channel-aware updater gateway.

## Why It Exists

Tauri v1 updater endpoints are configured statically in `tauri.conf.json`.
To support in-app runtime channel switching (`stable`/`dev`) without shipping separate app flavors, the app targets this gateway and passes channel+platform context.

## Request Contract

`GET /updater?target=<platform@channel>&current_version=<version>&arch=<arch>`

Examples:

1. `target=darwin-aarch64@stable`
2. `target=darwin-aarch64@dev`

`GET /health` returns basic service status.

## Channel Selection

1. `stable` channel maps to latest non-prerelease tag.
2. `dev` channel maps to latest prerelease/dev tag (`-dev.N`).

## Release Assets Read by Gateway

1. Stable: `stable-latest.json`
2. Dev: `dev-latest.json`

These files are produced by the release workflow and attached to each tag release.

## Local Run

```bash
pnpm updater:gateway:dev
```

Env vars:

1. `GITHUB_OWNER` (default `jessefreeman`)
2. `GITHUB_REPO` (default `gamenotebook`)
3. `GITHUB_TOKEN` (optional, recommended for rate limits)
4. `PORT` (default `8787`)

## Production Notes

1. Host this service at the domain configured in `src-tauri/tauri.conf.json`.
2. Use a GitHub token with read access to avoid public API rate-limit issues.
3. Add service monitoring on `/health`.
4. Fail closed: if manifest is missing/invalid, gateway returns `204` (no update).

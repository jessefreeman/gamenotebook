# Tag Baseline Migration Runbook

Use this once when resetting historical release tags to a new baseline.

## Goal

1. Preserve traceability of old releases.
2. Start a clean release/tag baseline for the new updater channel system.
3. Avoid breaking future updater behavior.

## Steps

1. Freeze release activity temporarily.
2. Export current release/tag inventory:
   - `git tag --list 'v*' > docs/archive-pre-reset-tags.txt`
   - Save GitHub release list export (JSON) in your private ops archive.
3. Publish a migration note release (or pinned repo note) stating:
   - last pre-reset tag
   - new baseline tag
   - where legacy binaries are archived
4. Create new baseline tag from desired commit:
   - example: `v1.0`
5. Ensure first post-reset stable release publishes:
   - full installers
   - signed updater bundles
   - `stable-latest.json`
   - `latest.json`
6. Ensure first post-reset dev release publishes:
   - full installers
   - signed updater bundles
   - `dev-latest.json`
7. Validate gateway behavior:
   - `stable` channel resolves stable manifest only.
   - `dev` channel resolves dev manifest only.
8. Keep legacy binaries downloadable (archive storage or retained release assets).

## Communication Template

1. "Release tag baseline reset effective on `<date>`."
2. "Old tags/releases are archived and still downloadable via `<location>`."
3. "New stable updates start at `<new-baseline-tag>`."
4. "Dev channel prereleases use `-dev.N` suffix."

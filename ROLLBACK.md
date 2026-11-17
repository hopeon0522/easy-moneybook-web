# UI preview and v0.8.1 recovery

Baseline commit: `3db0ae61c03435d634a959e7f7a2537142a7bc55`.

Backup directory: `/Users/sangbin_park/Documents/가계부 홈페이지-backups/v0.8.1`.

- `repository.bundle`: complete Git history, verified with `git bundle verify` and a fresh clone.
- `workspace.tar.gz`: original working folder including built files and local files, excluding Git internals, node_modules and pnpm cache.
- SHA256 repository.bundle: `0521a6f17d6b5d98ece401aa756d3337aee8a46c4e644b154e7fc52da80c13db`
- SHA256 workspace.tar.gz: `900f47da70b82329b9d2fc72bcccce4d1e63cc660b0975aecf37e1f9b904119c`

Restore into a new empty folder with `git clone <backup-directory>/repository.bundle <new-folder>` and check out the baseline commit. Install packages with `pnpm install --frozen-lockfile`, then run `pnpm build`. The built site is in `dist`.

To restore the public site later, create a new commit with the baseline tree and deploy it. Preserve newer history; do not force-push or reset a working tree containing user changes.

Browser IndexedDB data is separate from these filesystem backups. Before deploying or testing imports with real data, use Settings > full data backup in the browser containing the current records. Keep that dedicated backup locally. This UI revision does not change the API client, parser, storage schema or calculation utilities.

Version 0.9.0 uses the same IndexedDB database, store and key as 0.8.1. LocalData.version and backup formatVersion remain 1. Backup appVersion is informational only; both versions can read this format. No data migration is required. Localhost previews use a separate origin and do not automatically contain GitHub Pages data.

# v0.10.0 design refresh (Claude) recovery

Baseline commit: `911f992cda4238fdd3a3faa6c78f268e553c773e` (v0.9.7), tagged `backup/v0.9.7-pre-claude`.

v0.10.0 changes styling only: a design layer appended to the end of `src/styles.css` plus the three version strings. The API client, parser, storage schema and calculation utilities are unchanged, and the IndexedDB data and backup format (formatVersion 1) are the same as v0.9.7, so no data migration is needed.

Backups in `~/Desktop/Claude/backups/v0.9.7-before-claude-redesign/`:

- `repository.bundle`: complete Git history (all branches + backup tag), verified with `git bundle verify`.
- `source-v0.9.7.tar.gz`: source tree of commit 911f992.
- `SHA256SUMS`: checksums for both files.

Rollback options, from lightest to heaviest:

1. Design only: delete the block starting with `v0.10 Design refresh (Claude)` at the end of `src/styles.css`, then commit and push.
2. Full revert of the release: `git revert <v0.10.0 commit>` then `git push origin main`. This keeps history; do not force-push.
3. Disaster recovery: `git clone ~/Desktop/Claude/backups/v0.9.7-before-claude-redesign/repository.bundle restored && cd restored && git checkout backup/v0.9.7-pre-claude`.

Personal data: before testing any release, use Settings > full data backup in the browser and keep the JSON locally. GitHub and these file backups do not contain browser data.

# v0.11.0 wealth-dashboard redesign (Claude) recovery

Pre-release state: v0.10.0 (`5d21d81`), saved on GitHub as branch `backup/v0.10.0`.

v0.11.0 changes presentation only: new navy/slate design tokens (`src/styles.css`, `tailwind.config.js`), new dashboard components (`src/components/WealthOverview.tsx`, display-only metrics in `src/utils/insights.ts`), restyled table/upload/stat components, Pretendard font, and a new app icon. `src/api`, `src/lib`, existing `src/utils` files, `src/types` and `server` are unchanged. Data and backup format are identical (formatVersion 1); no migration.

Rollback options:

1. Revert this release only: `git revert <v0.11.0 commit>` then `git push origin main`.
2. Restore v0.10.0 exactly: `git checkout backup/v0.10.0 -- . && git commit -m "Restore v0.10.0" && git push origin main`.
3. Disaster recovery: clone from a bundle in `~/Desktop/Claude/backups/<version>/repository.bundle`.

From now on every release follows the backup protocol in `CLAUDE.md` (GitHub `backup/<previous version>` branch before pushing, plus a local bundle).

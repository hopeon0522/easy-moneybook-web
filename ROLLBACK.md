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

# v0.11.1 asset tab view/edit modes

Pre-release state: v0.11.0 (`2d3c7a7`), saved as branch `backup/v0.11.0`. UI-only change in the asset tab (summary strip, read-only list with shares, explicit edit mode). Asset save/move calls are unchanged. Revert with `git revert <v0.11.1 commit>`.

# v0.11.2 vendor bundle split + deploy smoke test

Pre-release state: v0.11.1 (`40225c1`), saved as branch `backup/v0.11.1`. Changes only build configuration (`vite.config.ts` manualChunks: vendor-react / vendor-excel / vendor) and CI (`.github/workflows/build-check.yml`, smoke test step in `pages.yml`, `scripts/smoke-test.mjs`). Application code is unchanged.

The Pages workflow now opens the built site in Chrome with sample data and clicks every tab before deploying; if anything throws, the deploy is skipped and the previous site stays live.

Rollback: `git revert <v0.11.2 commit>` (or restore `vite.config.ts` from `backup/v0.11.1`) and push.

# v0.11.3 real estate asset kind

Pre-release state: v0.11.2 (`e5ffc65`), saved as branch `backup/v0.11.2`. Adds `realEstate` ('부동산') to `AssetKind` (types, localStore row type, labels, dashboard allocation). No calculation code changed: net worth already treats every kind except card/loan as an asset. Stored data and backup formatVersion stay 1; existing data needs no migration.

Caution before reverting: if any asset was saved with kind `realEstate`, change it to another kind in the asset tab first, because older versions do not list that kind (its value would still count as an asset but it would not appear under a group).

# v0.11.4 faster dashboard, lazy Excel library, update notice

Pre-release state: v0.11.3 (`36513d5`), saved as branch `backup/v0.11.3`.

- `src/api/client.ts`: storage is read once even when many screens ask at the same time; dashboard totals, net worth line and debt ratio line are computed from per-account monthly totals instead of rescanning every transaction for every month and account. When any amount has decimals the debt ratio falls back to the original per-month scan so results stay bit-identical. Verified identical output for every read API on 8 datasets (small, real estate, 5-year 8,820 transactions, 3 random edge-case sets with hidden/archived/unknown accounts and blank dates, decimal amounts, empty). 5-year dataset: 680 ms → 92 ms, storage reads 22 → 1.
- Excel parser (exceljs, ~57% of the old startup JS) is loaded only when uploading. CI fails if `vendor-excel` is referenced from `index.html`.
- `vite.config.ts` writes `dist/version.json`; `UpdateNotice` compares it with the running version and offers a cache-busting reload.
- Net worth card shows a loading placeholder instead of ₩0.

Rollback: `git revert <v0.11.4 commit>` and push, or restore `src/api/client.ts` from `backup/v0.11.3` if only the calculation change needs undoing.

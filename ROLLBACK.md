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

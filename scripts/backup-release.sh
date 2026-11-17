#!/usr/bin/env bash
# 배포 전 백업: 현재 main을 GitHub 백업 브랜치로 올리고, 로컬에 전체 기록 번들을 만듭니다.
# 사용법: scripts/backup-release.sh <버전>   예) scripts/backup-release.sh v0.11.0
# 결과:
#   - GitHub 브랜치  backup/<버전>          (그 시점 main 상태)
#   - 로컬 파일      ~/Desktop/Claude/backups/<버전>/repository.bundle + SHA256SUMS
set -euo pipefail
VERSION="${1:?버전을 입력하세요. 예: v0.11.0}"
ROOT="$(git rev-parse --show-toplevel)"
DEST="${BACKUP_DIR:-$HOME/Desktop/Claude/backups}/$VERSION"
cd "$ROOT"
git fetch origin main --quiet || true
COMMIT="$(git rev-parse origin/main 2>/dev/null || git rev-parse HEAD)"
git push origin "$COMMIT:refs/heads/backup/$VERSION"
mkdir -p "$DEST"
git bundle create "$DEST/repository.bundle" --all
git bundle verify "$DEST/repository.bundle" >/dev/null
( cd "$DEST" && shasum -a 256 repository.bundle > SHA256SUMS 2>/dev/null || sha256sum repository.bundle > SHA256SUMS )
echo "백업 완료: GitHub backup/$VERSION ($COMMIT), 로컬 $DEST"

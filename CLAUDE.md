# EasyMoneyBook Web — Claude 작업 가이드

> Codex에서 이어받은 프로젝트입니다. Codex 대화 세션 대신, 56개 커밋 이력(2026-07-16 ~ 2026-10-02)과 소스 분석으로 작업 맥락을 정리했습니다.
> 이 파일은 Claude가 이 폴더에서 작업할 때 가장 먼저 읽는 안내서입니다.
> 작업 폴더: `~/Desktop/Claude/easy-moneybook-web` (원본 Codex 폴더 `~/Desktop/CODEX/가계부 홈페이지`는 참고용으로만 둠)

## 프로젝트 한 줄 요약
편한가계부(Android) 백업 Excel(.xlsx)을 업로드해 브라우저에서 거래·자산·연금·순자산을 분석하는 개인 가계부 웹앱.
배포: GitHub Pages (`https://github.com/hopeon0522/easy-moneybook-web`), 현재 버전 **v0.10.0** (Claude 디자인 개편). 개편 직전 상태는 태그 `backup/v0.9.7-pre-claude`(`911f992`).

## 아키텍처 (중요)
- **실제 운영 경로는 100% 프론트엔드**입니다. 개인 데이터는 브라우저 **IndexedDB**(`easy-moneybook-local` DB / `state` 스토어 / `primary` 키)에만 저장됩니다. (커밋 `7c32470 Store personal data locally in browser`)
- `src/api/client.ts`의 `api` 객체가 백엔드 API처럼 보이지만, 내부적으로 `src/lib/localStore.ts`를 읽고 쓰는 로컬 구현입니다. 네트워크 fetch는 `public/market-benchmarks.json`, `public/korea-net-worth-latest.json` 두 정적 파일뿐입니다.
- `server/`(Express + SQLite)는 **초기 버전의 레거시**입니다. `pnpm dev`로 로컬에서만 같이 뜨며, GitHub Pages에는 배포되지 않습니다. 새 기능은 server가 아닌 `client.ts`/`localStore.ts`에 구현하세요.
- Supabase 연동은 시도 후 되돌렸습니다(`cc91fae` → `2f9a01a` revert). 다시 넣지 마세요.

## 폴더 구조
| 경로 | 역할 |
|---|---|
| `src/App.tsx` | 거의 모든 화면(약 2,500줄). 탭: 대시보드·거래내역·카테고리·캘린더·자산·연금저축·백업·자산추정·설정 |
| `src/api/client.ts` | 데이터 계층(대시보드 집계, 연금, 벤치마크, 백업/복원, Excel 가져오기) |
| `src/lib/localStore.ts` | IndexedDB 스키마(`LocalData`, version 1) 및 로드/저장 |
| `src/lib/excelParser.ts` | 브라우저에서 편한가계부 xlsx 파싱 (exceljs) |
| `src/components/` | AnnualCategoryPanel, PeriodSelect, StatCard, TransactionTable, UploadDropzone |
| `src/utils/` | annualCategories(연간 카테고리 집계), format(금액 포맷) |
| `src/styles.css` | Tailwind + 커스텀 CSS |
| `scripts/update-wealth-benchmark.mjs` | 통계청(mods.go.kr) 가계금융복지조사 순자산 기준 갱신 → `public/korea-net-worth-latest.json` |
| `scripts/update-market-benchmarks.mjs` | FRED·네이버 금융 월말 지수 갱신 → `public/market-benchmarks.json` |
| `.github/workflows/pages.yml` | main push + 매일 06:17 KST(cron `17 21 * * *`) 자동 빌드/배포 |
| `EasyMoneyBook.app` | 로컬 실행용 macOS 런처 (Codex 런타임의 node/pnpm 경로를 사용) |
| `ROLLBACK.md` | v0.8.1 복구 절차와 백업 위치 |

## 작업 규칙 (Codex 시절 관행을 그대로 따름)
1. **변경할 때마다 버전 3곳을 함께 올립니다** (patch +1):
   - `package.json` → `"version"`
   - `src/App.tsx` → `const appVersion = 'v0.x.y'`
   - `src/api/client.ts` → `const backupAppVersion = '0.x.y'`
2. **커밋 메시지**: 영어, 명령형, 한 줄 (예: `Add annual category analysis and compact net worth axes`).
3. **배포 흐름**: `main`에 commit → `git push origin main` → GitHub Actions가 자동으로 Pages 배포. 큰 UI 개편은 `codex/ui-redesign-preview`처럼 별도 브랜치에서 작업 후 fast-forward 병합한 전례가 있습니다.
4. **데이터 호환성 유지**: `LocalData.version`과 백업 `formatVersion`은 1로 고정. 스키마를 바꿔야 하면 기존 백업을 읽을 수 있는 마이그레이션을 반드시 함께 작성.
5. **절대 커밋하지 말 것**: `data/`, `uploads/`, `private-export/`, `*.sqlite3`, `.env*` (실제 개인 가계부 데이터). `.gitignore`에 이미 등록됨.
6. force-push, reset 금지 (ROLLBACK.md 원칙).
7. UI 문구는 한국어, 금액은 한국식 단위(만/억) 포맷.

## 디자인 규칙 (v0.10.0~)
- 디자인 변경은 `src/styles.css` 맨 끝의 `v0.10 Design refresh (Claude)` 블록에서 CSS 변수(`--accent`, `--radius`, `--shadow`, `--panel`, `--line` 등)로 처리합니다.
- 계산/데이터 파일(`src/api/client.ts` 로직, `src/lib/*`, `src/utils/*`, `server/*`)은 디자인 작업에서 수정하지 않습니다. 커밋 전에 `git diff --stat`으로 확인하세요.
- 되돌리기 방법과 백업 위치는 `ROLLBACK.md`에 있습니다.

## 실행/빌드
```bash
pnpm install --frozen-lockfile
pnpm dev                 # 프론트 5173 + 레거시 서버 4000
pnpm exec vite build     # Pages와 동일한 빌드 (결과: dist/)
pnpm build               # tsc 타입체크 + 빌드
```
참고: Codex는 `~/.cache/codex-runtimes/...`의 번들 Node를 썼습니다. Claude에서 작업할 때는 시스템에 설치된 Node 22 + pnpm 11을 사용하세요.

## 최근 작업 흐름 (마지막 Codex 세션 맥락)
- v0.9.1~0.9.7 (2026-10-01~02): 대시보드에 최근 12개월 현금흐름 표 + 월별 순자산 → 연간 카테고리 분석 패널(`AnnualCategoryPanel`) 추가 → 연/월 선택기(`PeriodSelect`) 통일 → 막대 퍼센트 위치·숫자 셀 폭 미세 조정.
- 그 이전 주요 기능: 순자산 추정 시뮬레이터(자산추정 탭, 시나리오 표), 통계청 순자산 상위 분위 비교, 연금저축/퇴직연금 수기 원장 및 벤치마크(KOSPI·S&P 등) 비교, 단일 파일 백업/복원, iPhone 파일 선택 지원.

## 다음 후보 (README 기준, 미완료)
거래내역 Virtual Scroll · 날짜/금액 범위 필터 · 예산 CRUD/초과 알림 · xlsx/csv Export · PWA/오프라인 · 차트 lazy loading(현재 JS 번들 약 1.6MB) · App.tsx 분리 리팩터링

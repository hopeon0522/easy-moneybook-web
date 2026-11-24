# EasyMoneyBook Web — Claude 작업 가이드

> Codex에서 이어받은 프로젝트입니다. Codex 대화 세션 대신, 56개 커밋 이력(2026-07-16 ~ 2026-10-02)과 소스 분석으로 작업 맥락을 정리했습니다.
> 이 파일은 Claude가 이 폴더에서 작업할 때 가장 먼저 읽는 안내서입니다.
> 작업 폴더: `~/Desktop/Claude/easy-moneybook-web` (원본 Codex 폴더 `~/Desktop/CODEX/가계부 홈페이지`는 참고용으로만 둠)

## 프로젝트 한 줄 요약
편한가계부(Android) 백업 Excel(.xlsx)을 업로드해 브라우저에서 거래·자산·연금·순자산을 분석하는 개인 가계부 웹앱.
배포: GitHub Pages (`https://github.com/hopeon0522/easy-moneybook-web`), 현재 버전 **v0.12.0**. 이전 상태 백업: 브랜치 `backup/v0.11.5`, `backup/v0.11.4`, `backup/v0.11.3`, `backup/v0.11.2`, `backup/v0.11.1`, `backup/v0.11.0`, `backup/v0.10.0`, 태그 `backup/v0.9.7-pre-claude`.

## 아키텍처 (중요)
- **실제 운영 경로는 100% 프론트엔드**입니다. 개인 데이터는 브라우저 **IndexedDB**(`easy-moneybook-local` DB / `state` 스토어 / `primary` 키)에만 저장됩니다. (커밋 `7c32470 Store personal data locally in browser`)
- `src/api/client.ts`의 `api` 객체가 백엔드 API처럼 보이지만, 내부적으로 `src/lib/localStore.ts`를 읽고 쓰는 로컬 구현입니다. 네트워크 fetch는 `public/market-benchmarks.json`, `public/korea-net-worth-latest.json` 두 정적 파일뿐입니다.
- `server/`(Express + SQLite)는 **초기 버전의 레거시**입니다. `pnpm dev`로 로컬에서만 같이 뜨며, GitHub Pages에는 배포되지 않습니다. 새 기능은 server가 아닌 `client.ts`/`localStore.ts`에 구현하세요.
- Supabase 연동은 시도 후 되돌렸습니다(`cc91fae` → `2f9a01a` revert). 다시 넣지 마세요.

## 폴더 구조
| 경로 | 역할 |
|---|---|
| `src/App.tsx` | 거의 모든 화면(약 2,600줄). 탭: 대시보드·거래내역·카테고리·캘린더·자산·연금·자산추정·데이터·설정 |
| `src/api/client.ts` | 데이터 계층(대시보드 집계, 연금, 벤치마크, 백업/복원, Excel 가져오기) |
| `src/lib/localStore.ts` | IndexedDB 스키마(`LocalData`, version 1) 및 로드/저장 |
| `src/lib/excelParser.ts` | 브라우저에서 편한가계부 xlsx 파싱 (exceljs) |
| `src/components/` | AnnualCategoryPanel, PeriodSelect, StatCard, TransactionTable, UploadDropzone |
| `src/utils/` | annualCategories(연간 카테고리 집계), format(금액 포맷) |
| `src/styles.css` | Tailwind + 커스텀 CSS |
| `scripts/update-wealth-benchmark.mjs` | 통계청(mods.go.kr) 가계금융복지조사 순자산 기준 갱신 → `public/korea-net-worth-latest.json` |
| `scripts/update-market-benchmarks.mjs` | FRED·네이버 금융 월말 지수 갱신 → `public/market-benchmarks.json` |
| `.github/workflows/pages.yml` | main push + 매일 06:17 KST(cron `17 21 * * *`) 자동 빌드/배포 |
| `EasyMoneyBook.app` | 로컬 실행용 macOS 런처 (시스템 node/pnpm 사용) |
| `ROLLBACK.md` | 버전별 복구 절차와 백업 위치 |
| `scripts/backup-release.sh` | 배포 전 백업(브랜치 + 번들) 자동화 |
| `scripts/smoke-test.mjs` | 빌드 결과를 크롬으로 열어 모든 탭 오류 검사 (배포 전 자동 실행) |
| `.github/workflows/build-check.yml` | main 외 브랜치 push 시 빌드 + 스모크 테스트만 (배포 안 함) |

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

## 제품 방향
사용자가 원하는 것은 **전문성 있는 개인 자산관리 시스템**입니다. 노트북 위주 사용, 모바일도 확인. 첫 화면은 순자산과 자산 구성.
작업 중 모르는 것이 있으면 추측하지 말고 사용자에게 물어보고 진행합니다.

## 자산 분류
`AssetKind`: savings(저축) · investment(투자) · realEstate(부동산, v0.11.3) · card(카드) · checkCard(체크카드) · loan(대출) · other(기타). 부채는 card·loan뿐이고 나머지는 모두 자산으로 합산됩니다. 새 분류를 추가할 때는 `types/domain.ts`, `lib/localStore.ts`의 타입, `App.tsx`의 `assetKindLabels`(순서 = 자산 탭 표시 순서)와 접힘 상태, `utils/insights.ts`의 자산 구성 그룹을 함께 고칩니다.

## 디자인 시스템 (v0.12.0~, Claude 스타일)
- 톤: 따뜻한 아이보리 바탕(#FAF9F5) · 테라코타 포인트(#C96442) · 밝은 사이드바 · 얇은 테두리, 그림자 최소. 사용자가 직접 고른 방향입니다(이전 v0.11 네이비에서 변경).
- 색은 `src/styles.css` 상단의 `--c-*` 토큰(R G B)으로만 관리하고, Tailwind에서는 `accent / income / expense / gain / warn` (+ `-soft`) 클래스로 씁니다. 차트용 hex 팔레트는 `App.tsx`(pieColors 등), `AnnualCategoryPanel.tsx`, `insights.ts`에 같은 값으로 맞춰 둡니다.
- 의미: income=수입(차분한 파랑), expense=지출·손실(벽돌색), gain=수익·증가(세이지 그린), accent=브랜드/선택 상태(테라코타).
- Tailwind `zinc`는 따뜻한 회색 `stone`으로 매핑되어 있습니다(tailwind.config.js).
- 글꼴: 본문 Pretendard, 제목·큰 숫자 `--font-serif`(Noto Serif KR). 둘 다 index.html에서 비동기 로딩. 숫자는 tabular-nums.
- 강조(테라코타 채움) 버튼은 화면당 주요 동작 하나만. 나머지는 테두리 버튼.
- Claude 로고나 이름은 사용하지 않습니다(분위기만 참고).

## 메뉴 구조 (v0.12.0~)
개요(대시보드) · 분석(거래내역·카테고리·캘린더) · 자산(자산·연금·자산추정) · 관리(데이터·설정). `App.tsx`의 `tabs`, `navGroups`, `mobilePrimaryTabs`. 탭 이름을 바꾸면 `scripts/smoke-test.mjs`의 목록도 함께 고칩니다. 데이터 탭 = 업로드 파일 + 백업/복원 + 통계/시장지수 갱신 + 과거 순자산, 설정 탭 = 화면 설정(`SettingsForm section="settings"`).
- 대시보드 상단은 `src/components/WealthOverview.tsx`, 파생 지표는 `src/utils/insights.ts`(기존 계산 결과를 읽기만 하는 표시용 계산).
- 계산/데이터 파일(`src/api/client.ts` 로직, `src/lib/*`, 기존 `src/utils/*`, `server/*`)은 디자인 작업에서 수정하지 않습니다. 커밋 전에 `git diff --stat`으로 확인하세요.

## 설정 항목
설정은 `settings` 테이블의 key/value 행으로 저장됩니다(백업에 포함). 새 설정을 추가할 때는 `AppSettings` 타입, `client.ts`의 `settingsDefaults`·`settings()`·`updateSettings()`, `App.tsx`의 `SettingsForm`을 함께 고칩니다. 예: `usIndexDollarBasis`, `hideAllocationAmounts`(대시보드 자산 구성 금액 숨기기, v0.11.5).

## 아이콘
`public/icons/warm/`(v0.12 테라코타: favicon.svg·16·32·48 png, apple-touch-icon 180 꽉 찬 정사각형, mask-icon.svg; 이전 네이비는 `public/icons/`)와 `public/favicon.ico`. 앱 큰 아이콘 원본은 `assets/app-icon/easy-moneybook-icon.svg`. 사파리는 아이콘을 오래 저장하므로 디자인을 바꿀 때는 파일 이름을 바꿉니다.

## 성능 메모 (v0.11.4)
- `client.ts`의 `localData()`는 읽는 중인 작업을 공유해 저장소를 한 번만 읽습니다. `persist()`가 캐시를 갱신합니다.
- 대시보드 계산은 계좌별·월별 합계를 한 번 만들어 재사용합니다. 계산 로직을 고칠 때는 기존 버전과 결과가 같은지 여러 데이터셋으로 비교한 뒤 배포합니다(소수점 금액은 기존 방식으로 계산하는 안전장치 있음).
- exceljs는 업로드 시에만 `import()`로 불러옵니다. 정적 import로 되돌리지 마세요.
- `dist/version.json` + `UpdateNotice`: 새 배포가 있으면 화면 상단에 새로고침 안내가 뜹니다.

## 검증 절차
- 빌드 설정·라이브러리·구조처럼 위험한 변경은 `claude/<주제>` 브랜치에 먼저 push → `Build check` 워크플로 통과 확인 → main에 fast-forward.
- `pages.yml`은 배포 직전에 스모크 테스트를 돌리고, 실패하면 배포하지 않습니다(기존 사이트 유지).
- 클라우드 세션에서는 npm/Actions artifact 다운로드가 막혀 있으므로 실제 vite 빌드 검증은 GitHub Actions에서 합니다. 로컬 미리보기는 esbuild + tailwind CLI로 대신합니다.

## 백업 프로토콜 (매 배포마다 필수)
1. push 전에 현재 GitHub `main`을 `backup/<직전 버전>` 브랜치로 push (`scripts/backup-release.sh <직전 버전>` 또는 `git push origin origin/main:refs/heads/backup/<버전>`). 클라우드 세션에서는 태그 push가 막혀 있어 브랜치를 씁니다.
2. 가능하면 사용자 맥 `~/Desktop/Claude/backups/<버전>/`에 `repository.bundle`과 `SHA256SUMS`를 남깁니다.
3. `ROLLBACK.md`에 해당 버전의 되돌리기 방법을 추가합니다.
4. 사용자 가계부 데이터는 브라우저 IndexedDB에만 있으므로, 큰 변경 전에는 설정 → 전체 데이터 백업을 안내합니다.

## 실행/빌드
```bash
pnpm install --frozen-lockfile
pnpm dev                 # 프론트 5173 + 레거시 서버 4000
pnpm exec vite build     # Pages와 동일한 빌드 (결과: dist/)
pnpm build               # tsc 타입체크 + 빌드
```
Node 22 + pnpm 11을 사용합니다.

## 최근 작업 흐름 (마지막 Codex 세션 맥락)
- v0.9.1~0.9.7 (2026-10-01~02): 대시보드에 최근 12개월 현금흐름 표 + 월별 순자산 → 연간 카테고리 분석 패널(`AnnualCategoryPanel`) 추가 → 연/월 선택기(`PeriodSelect`) 통일 → 막대 퍼센트 위치·숫자 셀 폭 미세 조정.
- 그 이전 주요 기능: 순자산 추정 시뮬레이터(자산추정 탭, 시나리오 표), 통계청 순자산 상위 분위 비교, 연금저축/퇴직연금 수기 원장 및 벤치마크(KOSPI·S&P 등) 비교, 단일 파일 백업/복원, iPhone 파일 선택 지원.

## 다음 후보
App.tsx 탭별 분리 · 거래내역 Virtual Scroll · 날짜/금액 범위 필터 · 예산 CRUD/초과 알림 · xlsx/csv Export · PWA/오프라인 · 차트 lazy loading(현재 JS 번들 약 1.6MB) · App.tsx 분리 리팩터링

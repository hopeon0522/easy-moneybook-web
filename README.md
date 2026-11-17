# EasyMoneyBook Web

편한가계부 Android 앱에서 백업한 Excel(`.xlsx`) 파일을 업로드해 순자산·자산 구성·현금흐름·연금을 분석하는 개인 자산관리 웹앱입니다. 모든 데이터는 브라우저(IndexedDB)에만 저장됩니다.

## Stack

- Frontend: React, TypeScript, Vite, TailwindCSS
- Backend: Node.js, Express
- Database: SQLite via Repository Pattern
- Excel Parsing: exceljs
- Chart: Recharts
- Date: dayjs

## Run

```bash
pnpm install
pnpm dev
```

- Frontend: http://127.0.0.1:5173
- Backend: http://127.0.0.1:4000

Node 22와 pnpm이 필요합니다 (`brew install node && npm install -g pnpm`).

## GitHub Upload Notes

이 프로젝트는 `React/Vite` 프론트엔드와 `Express/SQLite` 백엔드가 함께 있는 앱입니다.

- GitHub 저장소에는 소스 코드만 올립니다.
- `data/`, `uploads/`, `.easy-moneybook-runtime/`, `node_modules/`, `dist/`는 `.gitignore`로 제외합니다.
- 실제 개인 가계부 DB와 업로드한 Excel 원본은 GitHub에 올리지 마세요.
- GitHub Pages는 정적 프론트엔드만 배포할 수 있습니다. SQLite/Excel 업로드 API까지 실제로 쓰려면 Render, Railway, Fly.io, VPS 같은 별도 백엔드 서버가 필요합니다.

## GitHub Pages

`.github/workflows/pages.yml`이 포함되어 있어 `main` 브랜치에 push하면 프론트엔드 정적 파일을 GitHub Pages에 배포합니다.

저장소 설정에서:

1. `Settings`
2. `Pages`
3. `Build and deployment`
4. `Source: GitHub Actions`

로 설정하세요.

## Commit And Push

```bash
git status
git add .
git commit -m "Prepare EasyMoneyBook web app for GitHub"
git branch -M main
git remote add origin https://github.com/<아이디>/<저장소명>.git
git push -u origin main
```

## Current Features

- 대시보드: 순자산(전월·1년 대비 증감, 24개월 추이), 자산 구성 비중, 저축률·월평균 지출·비상자금 커버리지·부채비율, 주요 보유 자산 (v0.11)
- 네이비·슬레이트 디자인 시스템, 다크모드, 모바일 카드형 거래 목록 (v0.11)

- 편한가계부 백업 원본 Excel 업로드
- 컬럼명 자동 매핑
  - `날짜`, `일자`, `기간`, `Date` -> date
  - `금액`, `KRW`, `Amount`, `거래금액` -> amount
- 거래내역 저장
- 카테고리, 자산, 태그 자동 추출
- 최근 거래 20건
- 카테고리별 지출 원형 그래프
- 월별 수입/지출 막대 그래프
- 자산 변화 선그래프
- 거래 검색/카테고리/계좌 필터 첫 버전
- 통계, 캘린더, 예산, 백업, 설정 화면 골격
- 다크모드
- Drag & Drop 업로드

## Verified Sample

샘플 파일:

`/Users/sangbin_park/Desktop/파이썬_연습/02_사용원본/2025-03-01 ~ 03-31.xlsx`

검증 결과:

- 156 transactions parsed
- `기간` 컬럼 날짜/시간 보정 완료
- 중복 `자산` 컬럼 중 첫 번째 계좌명 컬럼 사용

## Backup

배포 전에 `scripts/backup-release.sh <버전>`으로 GitHub 백업 브랜치(`backup/<버전>`)와 로컬 번들을 만듭니다. 되돌리는 방법은 `ROLLBACK.md`를 보세요.

## Next Iteration Candidates

- 거래내역 Virtual Scroll
- 날짜/금액 범위 필터 UI 완성
- 예산 CRUD와 초과 알림
- DB/xlsx/csv/json Export 구현
- PWA 및 오프라인 IndexedDB 캐싱
- 차트 Lazy Loading으로 번들 분리
- SQLite Repository 인터페이스를 PostgreSQL 구현으로 교체 가능하게 추상화 강화

// 빌드 결과(dist)를 실제 크롬으로 열어 화면이 깨지지 않는지 확인하는 스모크 테스트.
// 가짜 샘플 데이터를 IndexedDB에 넣고 모든 탭을 눌러 보며, 자바스크립트 오류가 하나라도 나면 실패합니다.
// 사용법: node scripts/smoke-test.mjs http://127.0.0.1:4173/
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://127.0.0.1:4173/';
const tabs = ['대시보드', '거래내역', '카테고리', '캘린더', '자산', '연금저축', '백업', '자산추정', '설정'];

function sampleData() {
  const now = '2026-01-01T00:00:00Z';
  const assets = [
    ['주거래통장', 'savings', 8000000], ['비상금', 'savings', 12000000], ['주식계좌', 'investment', 25000000],
    ['신용카드', 'card', 0], ['주택담보대출', 'loan', -150000000]
  ].map(([name, kind, initial], index) => ({ id: index + 1, name, kind, initial_value: initial, is_hidden: false, is_archived: false, linked_asset: '', sort_order: index, created_at: now, updated_at: now }));
  const transactions = [];
  let id = 1;
  for (let m = 0; m < 14; m += 1) {
    const year = 2025 + Math.floor(m / 12);
    const month = String((m % 12) + 1).padStart(2, '0');
    const add = (day, amount, type, category, asset) => transactions.push({ id: id++, date: `${year}-${month}-${String(day).padStart(2, '0')} 12:00`, amount, type, category, subcategory: '', asset, counter_asset: '', memo: category, tag: '', balance: null, merchant: category, source_file: 'sample.xlsx', created_at: now, updated_at: now });
    add(25, 4800000, 'income', '급여', '주거래통장');
    ['식비', '주거', '교통', '쇼핑'].forEach((category, index) => add(3 + index * 5, -(120000 + index * 40000), 'expense', category, index % 2 ? '신용카드' : '주거래통장'));
  }
  return { version: 1, transactions, assets, categories: [], tags: [], settings: [], manual_net_worth: [], pension_overrides: [], retirement_pension: [], import_files: [{ id: 1, source_file: 'sample.xlsx', transaction_count: transactions.length, first_date: transactions[0].date.slice(0, 10), last_date: transactions.at(-1).date.slice(0, 10), uploaded_at: now, updated_at: now }] };
}

const browser = await chromium.launch({ channel: process.env.SMOKE_CHANNEL || undefined });
const errors = [];
for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (error) => errors.push(`[${viewport.width}] pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error' && !/Failed to load resource|pretendard/i.test(message.text())) errors.push(`[${viewport.width}] console: ${message.text()}`); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate((data) => new Promise((resolve, reject) => {
    const request = indexedDB.open('easy-moneybook-local', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { const tx = request.result.transaction('state', 'readwrite'); tx.objectStore('state').put(data, 'primary'); tx.oncomplete = () => resolve(true); };
  }), sampleData());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.wealth-hero', { timeout: 15000 });
  const netWorth = await page.textContent('.wealth-headline strong');
  console.log(`[${viewport.width}] net worth rendered: ${netWorth}`);
  if (viewport.width > 800) {
    // 엑셀 업로드 경로: 업로드할 때만 불러오는 엑셀 라이브러리 파일이 실제로 받아지는지 확인합니다.
    // (빈 파일이라 내용 오류 안내가 뜨는 것은 정상이고, 파일을 못 불러오는 오류만 실패로 봅니다.)
    page.on('dialog', (dialog) => void dialog.dismiss());
    const excelChunk = page.waitForResponse((response) => /vendor-excel/.test(response.url()), { timeout: 15000 }).catch(() => null);
    await page.setInputFiles('header input[type=file]', { name: 'smoke.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('not a real workbook') });
    const response = await excelChunk;
    if (!response || !response.ok()) errors.push(`excel library did not load on upload (${response ? response.status() : 'no request'})`);
    else console.log(`[${viewport.width}] excel library loaded on upload: ${response.url().split('/').pop()}`);
    await page.waitForTimeout(1500);
    errors.splice(0, errors.length, ...errors.filter((message) => !/end of central directory|zip|Corrupted|invalid|xlsx/i.test(message)));
    for (const tab of tabs) {
      await page.click(`.desktop-sidebar button:has-text("${tab}")`);
      await page.waitForTimeout(500);
      const title = await page.textContent('.app-header h1');
      if (title?.trim() !== tab) errors.push(`tab ${tab} did not open (header: ${title})`);
      console.log(`[${viewport.width}] tab ok: ${tab}`);
    }
  }
  await page.close();
}
await browser.close();
if (errors.length) {
  console.error(`SMOKE TEST FAILED\n${errors.join('\n')}`);
  process.exit(1);
}
console.log('SMOKE TEST PASSED');

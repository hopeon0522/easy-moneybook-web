import fs from 'node:fs/promises';
import ExcelJS from 'exceljs';

const boardUrl = 'https://mods.go.kr/board.es?mid=b80501010000&bid=215';
const outputPath = new URL('../public/korea-net-worth-latest.json', import.meta.url);
const requestHeaders = { 'user-agent': 'EasyMoneyBook-Web/0.5 (+https://github.com/hopeon0522/easy-moneybook-web)' };

function text(value) {
  if (value == null) return '';
  if (typeof value === 'object' && 'text' in value) return String(value.text);
  return String(value);
}

function number(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} 값을 읽지 못했습니다.`);
  return parsed;
}

const boardResponse = await fetch(boardUrl, { headers: requestHeaders });
if (!boardResponse.ok) throw new Error(`국가데이터처 게시판 조회 실패: HTTP ${boardResponse.status}`);
const boardHtml = await boardResponse.text();
const entries = boardHtml
  .split('<a class="board_link"')
  .map((block) => {
    const year = Number(block.match(/(\d{4})년\s*가계금융복지조사 결과/)?.[1]);
    const listNo = block.match(/goView\('(\d+)'\)/)?.[1];
    const xlsxPath = block.match(/href="(\/boardDownload\.es\?bid=215(?:&amp;|&)list_no=\d+(?:&amp;|&)seq=\d+)"\s+class="bf_xlsx"/)?.[1];
    const publishedAt = block.match(/<strong>게시일<\/strong><span>(\d{4}-\d{2}-\d{2})<\/span>/)?.[1];
    return { year, listNo, xlsxPath, publishedAt };
  })
  .filter((entry) => entry.year && entry.listNo && entry.xlsxPath && entry.publishedAt)
  .sort((a, b) => b.year - a.year);

const latest = entries[0];
if (!latest) throw new Error('최신 가계금융복지조사 XLSX 첨부파일을 찾지 못했습니다.');

const xlsxUrl = new URL(latest.xlsxPath.replaceAll('&amp;', '&'), boardUrl);
const xlsxResponse = await fetch(xlsxUrl, { headers: requestHeaders });
if (!xlsxResponse.ok) throw new Error(`공식 XLSX 다운로드 실패: HTTP ${xlsxResponse.status}`);

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(Buffer.from(await xlsxResponse.arrayBuffer()));
const sheet = workbook.worksheets.find((candidate) => {
  let matched = false;
  candidate.eachRow((row) => {
    if (text(row.getCell(1).value).replace(/\s+/g, ' ').includes('순자산 분위 경계값')) matched = true;
  });
  return matched;
});
if (!sheet) throw new Error('공식 XLSX에서 순자산 분위 경계값 표를 찾지 못했습니다.');

const headerRow = sheet.getRow(5);
let latestColumn = 0;
headerRow.eachCell((cell, column) => {
  if (text(cell.value).includes(String(latest.year)) && column <= 5) latestColumn = column;
});
if (!latestColumn) throw new Error(`${latest.year}년 순자산 열을 찾지 못했습니다.`);

let averageNetWorth = 0;
const percentiles = [];
sheet.eachRow((row) => {
  const group = text(row.getCell(1).value).replace(/\s+/g, ' ');
  const item = text(row.getCell(2).value).trim();
  if (group.includes('순자산 5분위별 평균') && item === '전체') {
    averageNetWorth = Math.round(number(row.getCell(latestColumn).value, '평균 순자산') * 10_000);
  }
  if (group.includes('순자산 분위 경계값') && /^P\d+$/.test(item)) {
    percentiles.push({
      percentile: Number(item.slice(1)),
      amount: Math.round(number(row.getCell(latestColumn).value, `${item} 경계값`) * 10_000)
    });
  }
});
percentiles.sort((a, b) => a.percentile - b.percentile);
const medianNetWorth = percentiles.find((row) => row.percentile === 50)?.amount;
if (!averageNetWorth || !medianNetWorth || percentiles.length < 9) throw new Error('공식 순자산 통계 추출 결과가 불완전합니다.');

const payload = {
  surveyYear: latest.year,
  referenceDate: `${latest.year}-03-31`,
  publishedAt: latest.publishedAt,
  sourceCheckedAt: new Date().toISOString(),
  averageNetWorth,
  medianNetWorth,
  percentiles,
  sourceName: `국가데이터처·한국은행·금융감독원 ${latest.year}년 가계금융복지조사`,
  sourceUrl: `https://mods.go.kr/board.es?act=view&bid=215&list_no=${latest.listNo}&mid=b80501010000`
};

await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`${latest.year}년 공식 순자산 통계를 갱신했습니다: ${outputPath.pathname}`);

import fs from 'node:fs/promises';

const outputPath = new URL('../public/market-benchmarks.json', import.meta.url);
const startDate = '2016-01-01';
const today = new Date();
const currentMonth = today.toISOString().slice(0, 7);

function completedMonthRows(rows) {
  const latest = new Map();
  for (const row of rows) {
    const month = row.date.slice(0, 7);
    if (month >= currentMonth || !Number.isFinite(row.value)) continue;
    const existing = latest.get(month);
    if (!existing || row.date > existing.date) latest.set(month, row);
  }
  return [...latest.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, row]) => ({ month, ...row }));
}

async function fredSeries(id) {
  const response = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${startDate}`);
  if (!response.ok) throw new Error(`FRED ${id} 조회 실패: HTTP ${response.status}`);
  const rows = (await response.text()).trim().split(/\r?\n/).slice(1).map((line) => {
    const [date, rawValue] = line.split(',');
    return { date, value: Number(rawValue) };
  });
  return completedMonthRows(rows);
}

async function kospiSeries() {
  const start = startDate.replaceAll('-', '');
  const end = today.toISOString().slice(0, 10).replaceAll('-', '');
  const url = `https://api.finance.naver.com/siseJson.naver?symbol=KOSPI&requestType=1&startTime=${start}&endTime=${end}&timeframe=day`;
  const response = await fetch(url, { headers: { 'user-agent': 'EasyMoneyBook-Web/0.6' } });
  if (!response.ok) throw new Error(`코스피 조회 실패: HTTP ${response.status}`);
  const source = await response.text();
  const rows = [...source.matchAll(/\["(\d{8})",\s*[-\d.]+,\s*[-\d.]+,\s*[-\d.]+,\s*([-\d.]+)/g)].map((match) => ({
    date: `${match[1].slice(0, 4)}-${match[1].slice(4, 6)}-${match[1].slice(6, 8)}`,
    value: Number(match[2])
  }));
  if (!rows.length) throw new Error('코스피 일별 시세를 찾지 못했습니다.');
  return completedMonthRows(rows);
}

const [kospi, nasdaq100, sp500, usdkrw] = await Promise.all([
  kospiSeries(),
  fredSeries('NASDAQ100'),
  fredSeries('SP500'),
  fredSeries('DEXKOUS')
]);
const completedThrough = [kospi.at(-1)?.month, nasdaq100.at(-1)?.month, sp500.at(-1)?.month, usdkrw.at(-1)?.month]
  .filter(Boolean)
  .sort()[0];
if (!completedThrough) throw new Error('시장 지수 공통 기준월을 계산하지 못했습니다.');

const payload = {
  updatedAt: new Date().toISOString(),
  completedThrough,
  series: { kospi, nasdaq100, sp500, usdkrw },
  sources: {
    kospi: '네이버 금융 KOSPI 일별 시세',
    nasdaq100: 'FRED NASDAQ100',
    sp500: 'FRED SP500',
    usdkrw: 'FRED DEXKOUS'
  }
};
await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`시장 지수 월말 자료를 ${completedThrough}까지 갱신했습니다.`);

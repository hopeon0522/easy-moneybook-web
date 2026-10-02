import { useLayoutEffect, useRef } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AnnualCategoryData } from '../types/domain';
import { formatMoney } from '../utils/format';

const colors = ['#f37870', '#eda46b', '#e7bf58', '#9dbc71', '#6fbd9b', '#69b9c8', '#77a7d9', '#a197cf', '#c291ba'];

function Amount({ value }: { value: number | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let previousWidth = -1;
    const fit = () => {
      const width = element.clientWidth;
      if (width === previousWidth || width === 0) return;
      previousWidth = width;
      element.style.fontSize = '';
      const base = parseFloat(getComputedStyle(element).fontSize);
      if (element.scrollWidth > width) element.style.fontSize = `${base * (width - 1) / element.scrollWidth}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [value]);
  return <span ref={ref} className="annual-number">{value === null ? '—' : value.toLocaleString('ko-KR')}</span>;
}

function BarPercent({ x, y, width, height, value }: { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: unknown }) {
  const w = Number(width ?? 0);
  const h = Math.abs(Number(height ?? 0));
  if (!w || !h || !Number.isFinite(Number(value))) return null;
  const text = `${Number(value).toFixed(1)}%`;
  const fontSize = Math.min(11, (w - 4) / (text.length * 0.62), h - 2);
  if (fontSize <= 0) return null;
  return <text x={Number(x) + w / 2} y={Number(y) + Number(height) / 2} textAnchor="middle" dominantBaseline="central" fontSize={fontSize} fontWeight={650} fill="#343741" pointerEvents="none">{text}</text>;
}

export function AnnualCategoryPanel({ data, type, loading, onSelect, onTypeChange }: { data?: AnnualCategoryData | null; type: 'income' | 'expense'; loading: boolean; onSelect: (name: string) => void; onTypeChange: (type: 'income' | 'expense') => void }) {
  const rows = data?.rows ?? [];
  const months = data?.availableMonths ?? [];
  const totals = Array.from({ length: 12 }, (_, month) => rows.reduce((sum, row) => sum + row.months[month], 0));
  const total = totals.reduce((sum, amount) => sum + amount, 0);
  return <>
    <section className="rounded-lg bg-white p-4 dark:bg-zinc-900">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2>{data?.year ? `${data.year}년 ` : ''}카테고리별 {type === 'expense' ? '지출' : '수입'} 비중</h2><span className="text-xs text-zinc-500">{rows.length}개 항목</span></div>
      <div className="mb-5 flex flex-wrap gap-x-7 gap-y-3 text-sm"><span className="text-zinc-500">연 수입 <strong className="ml-2 text-[#2f8cff]">{formatMoney(data?.income ?? 0)}</strong></span><span className="text-zinc-500">연 지출 <strong className="ml-2 text-[#ff5a52]">{formatMoney(data?.expense ?? 0)}</strong></span><span className="text-zinc-500">연 순수익 <strong className="ml-2 text-emerald-600 dark:text-emerald-300">{formatMoney((data?.income ?? 0) - (data?.expense ?? 0))}</strong></span></div>
      {rows.length ? <div className="annual-category-chart"><ResponsiveContainer><BarChart data={rows} margin={{ top: 24, right: 12, bottom: 12, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 6" />
        <XAxis type="category" dataKey="name" interval={0} angle={rows.length > 6 ? -35 : 0} textAnchor={rows.length > 6 ? 'end' : 'middle'} height={rows.length > 6 ? 65 : 35} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#92949d' }} tickFormatter={value => String(value).length > 7 ? `${String(value).slice(0, 6)}…` : String(value)} />
        <YAxis type="number" width={42} tickFormatter={value => `${Number(value).toFixed(0)}%`} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#92949d' }} />
        <Tooltip cursor={{ fill: 'rgb(128 128 128 / .07)' }} content={({ active, payload }) => { const row = payload?.[0]?.payload as AnnualCategoryData['rows'][number] | undefined; return active && row ? <div className="category-year-tooltip"><strong>{row.name}</strong><p>{formatMoney(row.total)}</p><span>{row.percent.toFixed(1)}%</span></div> : null; }} />
        <Bar dataKey="percent" isAnimationActive={false} maxBarSize={42} radius={[4, 4, 0, 0]} label={<BarPercent />} onClick={entry => onSelect(String(entry.name))} className="cursor-pointer">{rows.map((row, index) => <Cell key={row.name} fill={colors[index % colors.length]} />)}</Bar>
      </BarChart></ResponsiveContainer></div> : <p className="py-10 text-center text-sm text-zinc-400">{loading ? '불러오는 중...' : '해당 연도의 거래가 없습니다.'}</p>}
    </section>
    <section className="rounded-lg bg-white p-4 dark:bg-zinc-900">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2>분류별 월별 금액</h2><div className="category-view-toggle">{(['expense', 'income'] as const).map(mode => <button key={mode} aria-pressed={type === mode} className={type === mode ? 'is-active' : ''} onClick={() => onTypeChange(mode)}>{mode === 'expense' ? '지출' : '수입'}</button>)}</div></div>
      <p className="mb-3 text-[11px] text-zinc-400">원 단위 · 평균: 자료가 있는 {months.length}개월 기준</p>
      <div className="annual-category-scroll"><table className="annual-category-table"><thead><tr><th scope="col">분류</th>{totals.map((_, index) => <th key={index} scope="col">{index + 1}월</th>)}<th scope="col">Total</th><th scope="col">평균</th></tr></thead><tbody>
        {rows.map((row, index) => <tr key={row.name}><th scope="row"><button onClick={() => onSelect(row.name)}><span style={{ backgroundColor: colors[index % colors.length] }} />{row.name}</button></th>{row.months.map((amount, month) => <td key={month} className={amount < 0 ? 'text-[#ff5a52]' : ''}><Amount value={months.includes(month) ? amount : null} /></td>)}<td className="annual-total"><Amount value={row.total} /></td><td><Amount value={Math.round(row.average)} /></td></tr>)}
        {!rows.length && <tr><td colSpan={15} className="text-center">{loading ? '불러오는 중...' : '표시할 데이터가 없습니다.'}</td></tr>}
      </tbody>{rows.length > 0 && <tfoot><tr><th scope="row">합계</th>{totals.map((amount, month) => <td key={month}><Amount value={months.includes(month) ? amount : null} /></td>)}<td><Amount value={total} /></td><td><Amount value={Math.round(total / (months.length || 1))} /></td></tr></tfoot>}</table></div>
    </section>
  </>;
}

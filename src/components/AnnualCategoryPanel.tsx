import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AnnualCategoryData } from '../types/domain';
import { formatMoney } from '../utils/format';

const colors = ['#f37870', '#eda46b', '#e7bf58', '#9dbc71', '#6fbd9b', '#69b9c8', '#77a7d9', '#a197cf', '#c291ba'];

export function AnnualCategoryPanel({ data, type, loading, onSelect }: { data?: AnnualCategoryData | null; type: 'income' | 'expense'; loading: boolean; onSelect: (name: string) => void }) {
  const rows = data?.rows ?? [];
  const months = data?.availableMonths ?? [];
  const totals = Array.from({ length: 12 }, (_, month) => rows.reduce((sum, row) => sum + row.months[month], 0));
  const total = totals.reduce((sum, amount) => sum + amount, 0);
  return <>
    <section className="rounded-lg bg-white p-4 dark:bg-zinc-900">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2>{data?.year ? `${data.year}년 ` : ''}카테고리별 {type === 'expense' ? '지출' : '수입'} 비중</h2><span className="text-xs text-zinc-500">{rows.length}개 항목</span></div>
      <div className="mb-5 flex flex-wrap gap-x-7 gap-y-3 text-sm"><span className="text-zinc-500">연 수입 <strong className="ml-2 text-[#2f8cff]">{formatMoney(data?.income ?? 0)}</strong></span><span className="text-zinc-500">연 지출 <strong className="ml-2 text-[#ff5a52]">{formatMoney(data?.expense ?? 0)}</strong></span><span className="text-zinc-500">연 순수익 <strong className="ml-2 text-emerald-600 dark:text-emerald-300">{formatMoney((data?.income ?? 0) - (data?.expense ?? 0))}</strong></span></div>
      {rows.length ? <div className="max-h-[520px] overflow-y-auto"><div style={{ height: Math.max(200, rows.length * 38) }}><ResponsiveContainer><BarChart data={rows} layout="vertical" margin={{ top: 8, right: 52, bottom: 12, left: 0 }}>
        <CartesianGrid horizontal={false} stroke="var(--line)" strokeDasharray="3 6" />
        <XAxis type="number" tickFormatter={value => `${Number(value).toFixed(0)}%`} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#92949d' }} />
        <YAxis type="category" dataKey="name" width={110} interval={0} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#92949d' }} tickFormatter={value => String(value).length > 11 ? `${String(value).slice(0, 10)}…` : String(value)} />
        <Tooltip cursor={{ fill: 'rgb(128 128 128 / .07)' }} content={({ active, payload }) => { const row = payload?.[0]?.payload as AnnualCategoryData['rows'][number] | undefined; return active && row ? <div className="category-year-tooltip"><strong>{row.name}</strong><p>{formatMoney(row.total)}</p><span>{row.percent.toFixed(1)}%</span></div> : null; }} />
        <Bar dataKey="percent" isAnimationActive={false} barSize={16} radius={[0, 4, 4, 0]} label={{ position: 'right', formatter: (value: unknown) => `${Number(value).toFixed(1)}%`, fontSize: 10, fill: '#92949d' }} onClick={entry => onSelect(String(entry.name))} className="cursor-pointer">{rows.map((row, index) => <Cell key={row.name} fill={colors[index % colors.length]} />)}</Bar>
      </BarChart></ResponsiveContainer></div></div> : <p className="py-10 text-center text-sm text-zinc-400">{loading ? '불러오는 중...' : '해당 연도의 거래가 없습니다.'}</p>}
    </section>
    <section className="rounded-lg bg-white p-4 dark:bg-zinc-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2>분류별 월별 금액</h2><span className="text-[11px] text-zinc-400">원 단위 · 평균: 자료가 있는 {months.length}개월 기준</span></div>
      <div className="annual-category-scroll"><table className="annual-category-table"><thead><tr><th scope="col">분류</th>{totals.map((_, index) => <th key={index} scope="col">{index + 1}월</th>)}<th scope="col">Total</th><th scope="col">평균</th></tr></thead><tbody>
        {rows.map((row, index) => <tr key={row.name}><th scope="row"><button onClick={() => onSelect(row.name)}><span style={{ backgroundColor: colors[index % colors.length] }} />{row.name}</button></th>{row.months.map((amount, month) => <td key={month} className={amount < 0 ? 'text-[#ff5a52]' : ''}>{months.includes(month) ? amount.toLocaleString('ko-KR') : '—'}</td>)}<td className="annual-total">{row.total.toLocaleString('ko-KR')}</td><td>{Math.round(row.average).toLocaleString('ko-KR')}</td></tr>)}
        {!rows.length && <tr><td colSpan={15} className="text-center">{loading ? '불러오는 중...' : '표시할 데이터가 없습니다.'}</td></tr>}
      </tbody>{rows.length > 0 && <tfoot><tr><th scope="row">합계</th>{totals.map((amount, month) => <td key={month}>{months.includes(month) ? amount.toLocaleString('ko-KR') : '—'}</td>)}<td>{total.toLocaleString('ko-KR')}</td><td>{Math.round(total / (months.length || 1)).toLocaleString('ko-KR')}</td></tr></tfoot>}</table></div>
    </section>
  </>;
}

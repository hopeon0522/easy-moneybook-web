import dayjs from 'dayjs';
import { type ComponentType, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { api } from './api/client';
import { StatCard } from './components/StatCard';
import { TransactionTable } from './components/TransactionTable';
import { UploadDropzone } from './components/UploadDropzone';
import { useAsync } from './hooks/useAsync';
import { AppSettings, AssetKind, ManualNetWorthPoint, PensionSavingsData } from './types/domain';
import { formatMoney } from './utils/format';

const tabs = ['대시보드', '거래내역', '카테고리', '캘린더', '자산', '연금저축', '백업', '설정'] as const;
const pieColors = ['#ff625a', '#ff944d', '#ffd23f', '#bde93f', '#64cf6b', '#5fded0', '#58a7f7', '#8b8cf6', '#c17bff', '#ff78a8'];
const incomeColor = '#2f8cff';
const expenseColor = '#ff5a52';
const netWorthColor = '#18a667';
const debtRatioColor = '#ff8a42';
const pensionReturnColor = '#ff8f8a';
const appVersion = 'v0.2.5';
const LoosePie = Pie as unknown as ComponentType<any>;
const assetKindLabels: Record<AssetKind, string> = {
  savings: '저축',
  investment: '투자',
  card: '카드',
  checkCard: '체크카드',
  loan: '대출',
  other: '기타'
};
const koreanHolidays: Record<string, string> = {
  '2025-01-01': '신정',
  '2025-01-28': '설날',
  '2025-01-29': '설날',
  '2025-01-30': '설날',
  '2025-03-01': '삼일절',
  '2025-03-03': '대체공휴일',
  '2025-05-05': '어린이날·부처님오신날',
  '2025-05-06': '대체공휴일',
  '2025-06-06': '현충일',
  '2025-08-15': '광복절',
  '2025-10-03': '개천절',
  '2025-10-05': '추석',
  '2025-10-06': '추석',
  '2025-10-07': '추석',
  '2025-10-08': '대체공휴일',
  '2025-10-09': '한글날',
  '2025-12-25': '성탄절',
  '2026-01-01': '신정',
  '2026-02-16': '설날',
  '2026-02-17': '설날',
  '2026-02-18': '설날',
  '2026-03-01': '삼일절',
  '2026-03-02': '대체공휴일',
  '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날',
  '2026-05-25': '대체공휴일',
  '2026-06-06': '현충일',
  '2026-08-15': '광복절',
  '2026-08-17': '대체공휴일',
  '2026-09-24': '추석',
  '2026-09-25': '추석',
  '2026-09-26': '추석',
  '2026-10-03': '개천절',
  '2026-10-05': '대체공휴일',
  '2026-10-09': '한글날',
  '2026-12-25': '성탄절'
};

function categoryLabel(props: { name?: string; cx?: number; cy?: number; midAngle?: number; innerRadius?: number; outerRadius?: number; percent?: number }) {
  const { name = '', cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0 } = props;
  if (percent < 0.06) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.62;
  const x = cx + radius * Math.cos((-midAngle * Math.PI) / 180);
  const y = cy + radius * Math.sin((-midAngle * Math.PI) / 180);
  const label = name.length > 7 ? `${name.slice(0, 7)}…` : name;
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700} pointerEvents="none">
      {label}
    </text>
  );
}

function dayTextClass(date: dayjs.Dayjs) {
  const key = date.format('YYYY-MM-DD');
  if (koreanHolidays[key] || date.day() === 0) return 'text-[#ff5a52] dark:text-[#ff817b]';
  if (date.day() === 6) return 'text-[#2f8cff] dark:text-blue-300';
  return '';
}

function shortPeriod(period?: string) {
  if (!period) return '-';
  const [year, month] = period.split('-');
  return `${year.slice(2)}/${month}`;
}

function monthToTime(period: string) {
  return dayjs(`${period}-01`).valueOf();
}

function formatChartYear(value: number | string) {
  return dayjs(Number(value)).format('YY/MM');
}

function gridMonthTicks(rows: Array<{ xValue: number }>, intervalMonths: number) {
  if (!rows.length) return [];
  const minTime = Math.min(...rows.map((row) => row.xValue));
  const maxTime = Math.max(...rows.map((row) => row.xValue));
  const safeInterval = Math.max(1, Math.round(intervalMonths || 12));
  let cursor = dayjs(minTime).date(1);
  const monthsUntilDecember = (11 - cursor.month() + 12) % 12;
  cursor = cursor.add(monthsUntilDecember, 'month');
  const ticks: number[] = [];
  while (cursor.valueOf() <= maxTime) {
    if (cursor.valueOf() >= minTime) ticks.push(cursor.valueOf());
    cursor = cursor.add(safeInterval, 'month');
  }
  return ticks;
}

function moneyGridTicks(rows: Array<{ netWorth: number }>, intervalWon: number) {
  if (!rows.length) return [];
  const unit = Math.max(100_000_000, Math.round((intervalWon || 100_000_000) / 100_000_000) * 100_000_000);
  const min = Math.min(...rows.map((row) => row.netWorth));
  const max = Math.max(...rows.map((row) => row.netWorth));
  let start = Math.floor(min / unit) * unit;
  let end = Math.ceil(max / unit) * unit;
  if (start === end) {
    start -= unit;
    end += unit;
  }
  const count = Math.round((end - start) / unit) + 1;
  return Array.from({ length: count }, (_, index) => start + index * unit);
}

function amountGridTicks(values: number[], intervalWon: number) {
  if (!values.length) return [];
  const unit = Math.max(10_000, Math.round((intervalWon || 10_000_000) / 10_000) * 10_000);
  let start = Math.floor(Math.min(...values) / unit) * unit;
  let end = Math.ceil(Math.max(...values) / unit) * unit;
  if (start === end) end += unit;
  const count = Math.round((end - start) / unit) + 1;
  return Array.from({ length: count }, (_, index) => start + index * unit);
}

function triangleChartDot(props: { cx?: number; cy?: number; stroke?: string }) {
  const { cx = 0, cy = 0, stroke = pensionReturnColor } = props;
  return <path d={`M ${cx} ${cy - 4} L ${cx + 4} ${cy + 3} L ${cx - 4} ${cy + 3} Z`} fill={stroke} stroke="#fff" strokeWidth={0.75} />;
}

function activeTriangleChartDot(props: { cx?: number; cy?: number; stroke?: string }) {
  const { cx = 0, cy = 0, stroke = pensionReturnColor } = props;
  return <path d={`M ${cx} ${cy - 8} L ${cx + 8} ${cy + 6} L ${cx - 8} ${cy + 6} Z`} fill={stroke} stroke="#fff" strokeWidth={1.25} />;
}

function ActivePieSector(props: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  startAngle?: number;
  endAngle?: number;
  fill?: string;
}) {
  const { cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, startAngle = 0, endAngle = 0, fill = '#ff625a' } = props;
  const offset = 10;
  const x = cx + offset * Math.cos((-midAngle * Math.PI) / 180);
  const y = cy + offset * Math.sin((-midAngle * Math.PI) / 180);
  return (
    <Sector
      className="pie-active-sector"
      cx={x}
      cy={y}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 8}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
    />
  );
}

export default function App() {
  const [tab, setTab] = useState<(typeof tabs)[number]>('대시보드');
  const [dark, setDark] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [asset, setAsset] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [categoryMode, setCategoryMode] = useState<'expense' | 'income'>('expense');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [netWorthMode, setNetWorthMode] = useState<'monthly' | 'yearly'>('monthly');
  const [hiddenAssetsCollapsed, setHiddenAssetsCollapsed] = useState(true);
  const [dashboardPieActiveIndex, setDashboardPieActiveIndex] = useState<number | undefined>();
  const [categoryPieActiveIndex, setCategoryPieActiveIndex] = useState<number | undefined>();
  const [localDataImporting, setLocalDataImporting] = useState(false);
  const [collapsedAssetKinds, setCollapsedAssetKinds] = useState<Record<AssetKind, boolean>>({
    savings: false,
    investment: false,
    card: false,
    checkCard: false,
    loan: false,
    other: false
  });

  const dashboard = useAsync(api.dashboard, []);
  const settings = useAsync(api.settings, []);
  const metadata = useAsync(api.metadata, []);
  const periods = useAsync(api.periods, []);
  const imports = useAsync(api.imports, []);
  const manualNetWorth = useAsync(api.manualNetWorth, []);
  const pensionSavings = useAsync(api.pensionSavings, []);
  const effectivePeriod = selectedPeriod || dashboard.data?.summary.latestPeriod || periods.data?.[0] || '';
  const categoryExpense = useAsync(() => api.categoryExpense(effectivePeriod, categoryMode), [categoryMode, effectivePeriod]);

  const transactionQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (effectivePeriod) params.set('period', effectivePeriod);
    if (search) params.set('q', search);
    if (category) params.set('category', category);
    if (asset) params.set('asset', asset);
    if (sortBy) params.set('sortBy', sortBy);
    params.set('limit', '2000');
    return `?${params.toString()}`;
  }, [asset, category, effectivePeriod, search, sortBy]);
  const transactions = useAsync(() => api.transactions(transactionQuery), [transactionQuery]);
  const calendarTransactionQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (effectivePeriod) params.set('period', effectivePeriod);
    params.set('limit', '2000');
    return `?${params.toString()}`;
  }, [effectivePeriod]);
  const calendarTransactions = useAsync(() => api.transactions(calendarTransactionQuery), [calendarTransactionQuery]);
  const categoryDetailQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (effectivePeriod) params.set('period', effectivePeriod);
    if (selectedCategory) params.set('category', selectedCategory);
    params.set('type', categoryMode);
    params.set('limit', '2000');
    return `?${params.toString()}`;
  }, [categoryMode, effectivePeriod, selectedCategory]);
  const categoryDetails = useAsync(() => api.transactions(categoryDetailQuery), [categoryDetailQuery]);

  async function refreshAll() {
    await Promise.all([
      dashboard.reload(),
      settings.reload(),
      metadata.reload(),
      periods.reload(),
      imports.reload(),
      manualNetWorth.reload(),
      pensionSavings.reload(),
      categoryExpense.reload(),
      transactions.reload(),
      calendarTransactions.reload(),
      categoryDetails.reload()
    ]);
  }

  async function upload(file: File) {
    await api.uploadExcel(file);
    await refreshAll();
  }

  const categoryOptions = metadata.data?.categories ?? [];
  const assetOptions = metadata.data?.assets ?? [];
  const periodOptions = periods.data?.length ? periods.data : dashboard.data?.summary.latestPeriod ? [dashboard.data.summary.latestPeriod] : [];
  const recent = dashboard.data?.recent ?? [];
  const selectedMonthRows = calendarTransactions.data ?? [];
  const calendarSummary = useMemo(
    () =>
      selectedMonthRows.reduce(
        (acc, row) => {
          if (row.type === 'income') acc.income += row.amount;
          if (row.type === 'expense') acc.expense += -row.amount;
          return acc;
        },
        { income: 0, expense: 0 }
      ),
    [selectedMonthRows]
  );
  const netWorthRows = useMemo(() => {
    const rows =
      netWorthMode === 'monthly'
        ? dashboard.data?.assetLine ?? []
        : (dashboard.data?.assetLineYearly ?? []).map((row) => ({ month: row.month ?? `${row.year}-12`, netWorth: row.netWorth, isManual: row.isManual }));
    const ratioRows =
      netWorthMode === 'monthly'
        ? dashboard.data?.debtRatioLine ?? []
        : (dashboard.data?.debtRatioLineYearly ?? []).map((row) => ({ month: row.month ?? `${row.year}-12`, debtRatio: row.debtRatio }));
    const ratioByMonth = new Map(ratioRows.map((row) => [row.month, row.debtRatio]));
    return rows.map((row, index) => ({
      ...row,
      xValue: monthToTime(row.month),
      debtRatio: ratioByMonth.get(row.month) ?? 0,
      delta: index === 0 ? null : row.netWorth - rows[index - 1].netWorth
    }));
  }, [dashboard.data?.assetLine, dashboard.data?.assetLineYearly, dashboard.data?.debtRatioLine, dashboard.data?.debtRatioLineYearly, netWorthMode]);
  const dashboardPieRows = (dashboard.data?.categoryPie ?? []).map((row, index) => ({ ...row, color: pieColors[index % pieColors.length] }));
  const categoryPieRows = (categoryExpense.data?.rows ?? []).map((row, index) => ({ ...row, color: pieColors[index % pieColors.length] }));
  const chartGridXMonths = settings.data?.chartGridXMonths ?? 12;
  const chartGridYWon = settings.data?.chartGridYWon ?? 100_000_000;
  const netWorthXTicks = useMemo(() => gridMonthTicks(netWorthRows, chartGridXMonths), [chartGridXMonths, netWorthRows]);
  const netWorthYTicks = useMemo(() => moneyGridTicks(netWorthRows, chartGridYWon), [chartGridYWon, netWorthRows]);
  const pensionRows = useMemo(
    () =>
      (dashboard.data?.pensionLine ?? []).map((row) => ({
        ...row,
        xValue: monthToTime(row.month),
        returnRate: row.principal ? (row.profit / row.principal) * 100 : 0
      })),
    [dashboard.data?.pensionLine]
  );
  const pensionChartGridXMonths = settings.data?.pensionChartGridXMonths ?? 12;
  const pensionChartGridYWon = settings.data?.pensionChartGridYWon ?? 10_000_000;
  const pensionXTicks = useMemo(() => gridMonthTicks(pensionRows, pensionChartGridXMonths), [pensionChartGridXMonths, pensionRows]);
  const pensionYTicks = useMemo(
    () => amountGridTicks(pensionRows.flatMap((row) => [row.principal, row.total]), pensionChartGridYWon),
    [pensionChartGridYWon, pensionRows]
  );

  const calendarCells = useMemo(() => {
    if (!effectivePeriod) return [];
    const first = dayjs(`${effectivePeriod}-01`);
    const start = first.subtract(first.day(), 'day');
    const totals = new Map<string, { income: number; expense: number; transfer: number }>();
    for (const row of calendarTransactions.data ?? []) {
      const day = row.date.slice(0, 10);
      const current = totals.get(day) ?? { income: 0, expense: 0, transfer: 0 };
      current[row.type] += row.type === 'expense' ? -row.amount : row.amount;
      totals.set(day, current);
    }
    return Array.from({ length: 42 }, (_, index) => {
      const date = start.add(index, 'day');
      return {
        date,
        key: date.format('YYYY-MM-DD'),
        currentMonth: date.format('YYYY-MM') === effectivePeriod,
        totals: totals.get(date.format('YYYY-MM-DD')) ?? { income: 0, expense: 0, transfer: 0 }
      };
    });
  }, [effectivePeriod, calendarTransactions.data]);

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen bg-[#f6f6f8] text-zinc-950 antialiased dark:bg-zinc-950 dark:text-zinc-50">
        <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-normal">{settings.data?.appTitle ?? 'EasyMoneyBook Web'}</h1>
                  <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300">{appVersion}</span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{settings.data?.appSubtitle ?? '편한가계부 Excel 백업 분석 공간'}</p>
              </div>
              <div className="flex items-center gap-2">
                <UploadDropzone onUpload={upload} compact />
                <button className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200" onClick={() => setDark((value) => !value)}>
                  {dark ? '라이트모드' : '다크모드'}
                </button>
              </div>
            </div>
            <nav className="flex gap-1 overflow-auto rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
              {tabs.map((item) => (
                <button
                  key={item}
                  className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    tab === item
                      ? 'bg-white text-[#ff5a52] shadow-sm dark:bg-zinc-950 dark:text-[#ff817b]'
                      : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                  }`}
                  onClick={() => {
                    setTab(item);
                    if (item === '대시보드') window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  {item}
                </button>
              ))}
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          {!dashboard.loading && !dashboard.data?.summary.latestPeriod && (
            <section className="mb-5 flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-900">
              <div>
                <h2 className="text-base font-semibold">내 로컬 가계부 데이터 불러오기</h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">데이터는 이 브라우저에만 저장되며 GitHub나 외부 서버로 전송되지 않습니다.</p>
              </div>
              <label className={`inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-[#ff5a52] px-4 text-sm font-semibold text-white ${localDataImporting ? 'pointer-events-none opacity-50' : ''}`}>
                {localDataImporting ? '불러오는 중...' : '데이터 파일 선택'}
                <input
                  className="hidden"
                  type="file"
                  accept="application/json,.json"
                  disabled={localDataImporting}
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.currentTarget.value = '';
                    if (!file) return;
                    setLocalDataImporting(true);
                    try {
                      const result = await api.importLegacyData(file);
                      await refreshAll();
                      window.alert(`${result.count.toLocaleString()}건의 거래 데이터를 불러왔습니다.`);
                    } catch (error) {
                      window.alert(error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.');
                    } finally {
                      setLocalDataImporting(false);
                    }
                  }}
                />
              </label>
            </section>
          )}
          {tab === '대시보드' && (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                <StatCard label={`최근 월 수입 (${shortPeriod(dashboard.data?.summary.latestPeriod)})`} value={formatMoney(dashboard.data?.summary.monthIncome ?? 0)} tone="blue" />
                <StatCard label={`최근 월 지출 (${shortPeriod(dashboard.data?.summary.latestPeriod)})`} value={formatMoney(dashboard.data?.summary.monthExpense ?? 0)} tone="red" />
                <StatCard label={`최근 월 순수익 (${shortPeriod(dashboard.data?.summary.latestPeriod)})`} value={formatMoney(dashboard.data?.summary.monthNet ?? 0)} tone="green" />
                <StatCard label="총자산" value={formatMoney(dashboard.data?.summary.totalAssets ?? 0)} />
                <StatCard label="부채" value={formatMoney(dashboard.data?.summary.liabilities ?? 0)} tone="red" />
                <StatCard label="순자산" value={formatMoney(dashboard.data?.summary.netWorth ?? 0)} tone="green" />
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold">카테고리별 지출</h2>
                    <span className="rounded-lg bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {dashboard.data?.summary.latestPeriod || '데이터 없음'}
                    </span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_190px]">
                    <div className="h-72">
                      <ResponsiveContainer>
                        <PieChart>
                          <LoosePie
                            data={dashboardPieRows}
                            dataKey="value"
                            nameKey="name"
                            outerRadius={108}
                            isAnimationActive={false}
                            activeIndex={dashboardPieActiveIndex}
                            activeShape={ActivePieSector}
                            label={categoryLabel}
                            labelLine={false}
                            onMouseEnter={(_: unknown, index: number) => setDashboardPieActiveIndex(index)}
                            onMouseLeave={() => setDashboardPieActiveIndex(undefined)}
                          >
                            {dashboardPieRows.map((row) => (
                              <Cell key={row.name} fill={row.color} />
                            ))}
                          </LoosePie>
                          <Tooltip content={<CategoryTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <CategoryPercentList rows={dashboard.data?.categoryPie ?? []} />
                  </div>
                </section>
                <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <h2 className="mb-3 text-sm font-semibold">월별 수입/지출</h2>
                  <div className="h-72">
                    <ResponsiveContainer>
                      <BarChart data={dashboard.data?.monthlyBars ?? []}>
                        <CartesianGrid stroke="#eeeeef" vertical={false} />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#8b8b91' }} />
                        <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `${Math.round(Number(value) / 10000)}만`} tick={{ fontSize: 11, fill: '#8b8b91' }} />
                        <Tooltip formatter={(value) => formatMoney(Number(value))} />
                        <Bar dataKey="income" fill={incomeColor} name="수입" radius={[7, 7, 0, 0]} className="chart-hover" />
                        <Bar dataKey="expense" fill={expenseColor} name="지출" radius={[7, 7, 0, 0]} className="chart-hover" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              </div>

              <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">{netWorthMode === 'monthly' ? '월별' : '연별'} 순자산 변화</h2>
                  <div className="flex rounded-lg bg-zinc-100 p-1 text-xs dark:bg-zinc-800">
                    <button className={`rounded-md px-3 py-1.5 font-semibold ${netWorthMode === 'monthly' ? 'bg-white text-[#ff5a52] shadow-sm dark:bg-zinc-950' : 'text-zinc-500'}`} onClick={() => setNetWorthMode('monthly')}>월간</button>
                    <button className={`rounded-md px-3 py-1.5 font-semibold ${netWorthMode === 'yearly' ? 'bg-white text-[#ff5a52] shadow-sm dark:bg-zinc-950' : 'text-zinc-500'}`} onClick={() => setNetWorthMode('yearly')}>연간</button>
                  </div>
                </div>
                <div className="h-72">
                  <ResponsiveContainer>
                    <LineChart data={netWorthRows}>
                      <CartesianGrid stroke="transparent" />
                      <XAxis
                        dataKey="xValue"
                        type="number"
                        scale="time"
                        domain={['dataMin', 'dataMax']}
                        ticks={netWorthXTicks}
                        tickFormatter={formatChartYear}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#9f9fa5' }}
                      />
                      <YAxis
                        yAxisId="netWorth"
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(value) => formatMoney(Number(value))}
                        ticks={netWorthYTicks}
                        domain={[netWorthYTicks[0] ?? 'auto', netWorthYTicks[netWorthYTicks.length - 1] ?? 'auto']}
                        tick={{ fontSize: 10, fill: '#8b8b91' }}
                        width={92}
                      />
                      <YAxis yAxisId="debtRatio" orientation="right" axisLine={false} tickLine={false} tickFormatter={(value) => `${Number(value).toFixed(0)}%`} tick={{ fontSize: 10, fill: '#8b8b91' }} width={46} />
                      {netWorthXTicks.map((tick) => (
                        <ReferenceLine key={`x-${tick}`} x={tick} yAxisId="netWorth" stroke="#d9d9de" strokeDasharray="4 7" strokeOpacity={0.55} />
                      ))}
                      {netWorthYTicks.map((tick) => (
                        <ReferenceLine key={`y-${tick}`} y={tick} yAxisId="netWorth" stroke="#d9d9de" strokeDasharray="4 7" strokeOpacity={0.55} />
                      ))}
                      <Tooltip content={<NetWorthTooltip mode={netWorthMode} />} />
                      <Line yAxisId="netWorth" type="monotone" dataKey="netWorth" stroke={netWorthColor} strokeWidth={3} name="순자산" dot={{ r: 2 }} activeDot={{ r: 8 }} />
                      <Line yAxisId="debtRatio" type="monotone" dataKey="debtRatio" stroke={debtRatioColor} strokeWidth={2.5} name="부채율" dot={triangleChartDot} activeDot={activeTriangleChartDot} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">삼성증권 연금저축 변화</h2>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">이체는 원금, 수입·기타 거래는 수익으로 누적 계산</p>
                  </div>
                  {pensionRows.length > 0 && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <span className="text-zinc-500">원금 <strong className="ml-1 text-[#2f8cff]">{formatMoney(pensionRows[pensionRows.length - 1].principal)}</strong></span>
                      <span className="text-zinc-500">수익 <strong className={`ml-1 ${pensionRows[pensionRows.length - 1].profit < 0 ? 'text-[#ff5a52]' : 'text-[#18a667]'}`}>{formatMoney(pensionRows[pensionRows.length - 1].profit)}</strong></span>
                      <span className="text-zinc-500">총액 <strong className="ml-1 text-zinc-950 dark:text-white">{formatMoney(pensionRows[pensionRows.length - 1].total)}</strong></span>
                    </div>
                  )}
                </div>
                {pensionRows.length > 0 ? (
                  <div className="h-72">
                    <ResponsiveContainer>
                      <LineChart data={pensionRows}>
                        <CartesianGrid stroke="transparent" />
                        <XAxis
                          dataKey="xValue"
                          type="number"
                          scale="time"
                          domain={['dataMin', 'dataMax']}
                          ticks={pensionXTicks}
                          tickFormatter={formatChartYear}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: '#9f9fa5' }}
                        />
                        <YAxis yAxisId="amount" axisLine={false} tickLine={false} ticks={pensionYTicks} domain={[pensionYTicks[0] ?? 'auto', pensionYTicks[pensionYTicks.length - 1] ?? 'auto']} tickFormatter={(value) => `${Math.round(Number(value) / 10_000)}만`} tick={{ fontSize: 10, fill: '#8b8b91' }} width={62} />
                        <YAxis yAxisId="returnRate" orientation="right" axisLine={false} tickLine={false} tickFormatter={(value) => `${Number(value).toFixed(0)}%`} tick={{ fontSize: 10, fill: pensionReturnColor }} width={48} />
                        {pensionXTicks.map((tick) => <ReferenceLine key={`pension-x-${tick}`} x={tick} yAxisId="amount" stroke="#d9d9de" strokeDasharray="4 7" strokeOpacity={0.55} />)}
                        {pensionYTicks.map((tick) => <ReferenceLine key={`pension-y-${tick}`} y={tick} yAxisId="amount" stroke="#d9d9de" strokeDasharray="4 7" strokeOpacity={0.55} />)}
                        <Tooltip content={<PensionTooltip />} />
                        <Line yAxisId="amount" type="monotone" dataKey="principal" stroke="#2f8cff" strokeWidth={2.5} name="원금" dot={{ r: 2 }} activeDot={{ r: 6 }} />
                        <Line yAxisId="amount" type="monotone" dataKey="total" stroke="#18a667" strokeWidth={3} name="총액" dot={{ r: 2 }} activeDot={{ r: 8 }} />
                        <Line yAxisId="returnRate" type="monotone" dataKey="returnRate" stroke={pensionReturnColor} strokeWidth={2.25} name="수익률" dot={triangleChartDot} activeDot={activeTriangleChartDot} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="grid h-40 place-items-center text-sm text-zinc-500">삼성증권연금저축 거래가 없습니다.</div>
                )}
              </section>

              <section>
                <h2 className="mb-3 text-sm font-semibold">최근 거래 20건</h2>
                <TransactionTable rows={recent} />
              </section>
            </div>
          )}

          {tab === '거래내역' && (
            <div className="space-y-4">
              <PeriodButtons periods={periodOptions} selected={effectivePeriod} onSelect={setSelectedPeriod} />
              <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="grid gap-3 md:grid-cols-6">
                  <input className="rounded-lg border border-zinc-300 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950 md:col-span-2" placeholder="전체 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
                  <select className="rounded-lg border border-zinc-300 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="">카테고리 전체</option>
                    {categoryOptions.map((item) => (
                      <option key={item.id} value={item.name}>{item.name}</option>
                    ))}
                  </select>
                  <select className="rounded-lg border border-zinc-300 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950" value={asset} onChange={(e) => setAsset(e.target.value)}>
                    <option value="">계좌 전체</option>
                    {assetOptions.map((item) => (
                      <option key={item.id} value={item.name}>{item.name}</option>
                    ))}
                  </select>
                  <select className="rounded-lg border border-zinc-300 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                    <option value="date">날짜순</option>
                    <option value="amount">금액순</option>
                    <option value="createdAt">등록순</option>
                    <option value="updatedAt">수정순</option>
                  </select>
                </div>
              </section>
              <TransactionTable rows={transactions.data ?? []} />
            </div>
          )}

          {tab === '카테고리' && (
            <div className="space-y-4">
              <PeriodButtons periods={periodOptions} selected={effectivePeriod} onSelect={setSelectedPeriod} />
              <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">
                    {effectivePeriod} 카테고리별 {categoryMode === 'expense' ? '지출' : '수입'}
                  </h2>
                  <div className="flex rounded-lg bg-zinc-100 p-1 text-xs dark:bg-zinc-800">
                    <button
                      className={`rounded-md px-3 py-1.5 font-semibold ${categoryMode === 'expense' ? 'bg-white text-[#ff5a52] shadow-sm dark:bg-zinc-950' : 'text-zinc-500'}`}
                      onClick={() => {
                        setCategoryMode('expense');
                        setSelectedCategory('');
                      }}
                    >
                      지출
                    </button>
                    <button
                      className={`rounded-md px-3 py-1.5 font-semibold ${categoryMode === 'income' ? 'bg-white text-[#ff5a52] shadow-sm dark:bg-zinc-950' : 'text-zinc-500'}`}
                      onClick={() => {
                        setCategoryMode('income');
                        setSelectedCategory('');
                      }}
                    >
                      수입
                    </button>
                  </div>
                </div>
                <div className="mb-4 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-lg bg-blue-50 px-3 py-1 font-semibold text-[#2f8cff] dark:bg-blue-950 dark:text-blue-200">
                    월 수입 {formatMoney(categoryExpense.data?.summary.income ?? 0)}
                  </span>
                  <span className="rounded-lg bg-red-50 px-3 py-1 font-semibold text-[#ff5a52] dark:bg-rose-950 dark:text-rose-200">
                    월 지출 {formatMoney(categoryExpense.data?.summary.expense ?? 0)}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
                    월 순수익 {formatMoney((categoryExpense.data?.summary.income ?? 0) - (categoryExpense.data?.summary.expense ?? 0))}
                  </span>
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="h-80">
                    <ResponsiveContainer>
                      <PieChart>
                        <LoosePie
                          data={categoryPieRows}
                          dataKey="value"
                          nameKey="name"
                          outerRadius={116}
                          isAnimationActive={false}
                          activeIndex={categoryPieActiveIndex}
                          activeShape={ActivePieSector}
                          label={categoryLabel}
                          labelLine={false}
                          onMouseEnter={(_: unknown, index: number) => setCategoryPieActiveIndex(index)}
                          onMouseLeave={() => setCategoryPieActiveIndex(undefined)}
                          onClick={(data: { name?: string }) => setSelectedCategory(String(data.name ?? ''))}
                        >
                          {categoryPieRows.map((row) => (
                            <Cell key={row.name} fill={row.color} className="cursor-pointer" />
                          ))}
                        </LoosePie>
                        <Tooltip content={<CategoryTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <table className="min-w-full text-sm">
                      <tbody>
                        {(categoryExpense.data?.rows ?? []).map((row, index) => (
                          <tr
                            key={row.name}
                            className={`cursor-pointer border-b border-zinc-100 dark:border-zinc-800 ${selectedCategory === row.name ? 'bg-red-50/80 dark:bg-red-950/20' : ''}`}
                            onClick={() => setSelectedCategory(row.name)}
                          >
                            <td className="px-3 py-2"><span className="mr-2 inline-block h-3 w-3 rounded-full" style={{ backgroundColor: pieColors[index % pieColors.length] }} />{row.name}</td>
                            <td className={`px-3 py-2 text-right font-medium ${categoryMode === 'income' && row.signedValue < 0 ? 'text-[#ff5a52] dark:text-[#ff817b]' : ''}`}>
                              {formatMoney(categoryMode === 'income' ? row.signedValue : row.value)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
              {selectedCategory && (
                <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold">
                      {effectivePeriod} {selectedCategory} {categoryMode === 'expense' ? '지출' : '수입'} 내역
                    </h2>
                    <button className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold dark:border-zinc-700" onClick={() => setSelectedCategory('')}>
                      선택 해제
                    </button>
                  </div>
                  <TransactionTable rows={categoryDetails.data ?? []} />
                </section>
              )}
            </div>
          )}

          {tab === '캘린더' && (
            <div className="space-y-4">
              <PeriodButtons periods={periodOptions} selected={effectivePeriod} onSelect={setSelectedPeriod} />
              <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">{effectivePeriod} 캘린더</h2>
                  <div className="flex gap-2 text-xs">
                    <span className="rounded-lg bg-blue-50 px-3 py-1 font-semibold text-[#2f8cff] dark:bg-blue-950 dark:text-blue-200">수입 {formatMoney(calendarSummary.income)}</span>
                    <span className="rounded-lg bg-red-50 px-3 py-1 font-semibold text-[#ff5a52] dark:bg-rose-950 dark:text-rose-200">지출 {formatMoney(calendarSummary.expense)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-zinc-200 text-xs dark:border-zinc-800">
                  {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
                    <div key={day} className={`bg-zinc-50 p-2 text-center font-semibold dark:bg-zinc-950 ${day === '일' ? 'text-[#ff5a52] dark:text-[#ff817b]' : day === '토' ? 'text-[#2f8cff] dark:text-blue-300' : 'text-zinc-500'}`}>{day}</div>
                  ))}
                  {calendarCells.map((cell) => (
                    <div key={cell.key} className={`min-h-28 border-t border-zinc-200 p-2 dark:border-zinc-800 ${cell.currentMonth ? 'bg-white dark:bg-zinc-950' : 'bg-zinc-50 text-zinc-400 dark:bg-zinc-900'}`}>
                      <div className={`mb-1 font-semibold ${dayTextClass(cell.date)}`}>{cell.date.date()}</div>
                      {koreanHolidays[cell.key] && <div className="mb-1 truncate text-[11px] font-semibold text-[#ff5a52] dark:text-[#ff817b]">{koreanHolidays[cell.key]}</div>}
                      {cell.totals.income > 0 && <div className="truncate font-medium text-[#2f8cff]">수 {formatMoney(cell.totals.income)}</div>}
                      {cell.totals.expense > 0 && <div className="truncate font-medium text-[#ff5a52]">지 {formatMoney(cell.totals.expense)}</div>}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {tab === '자산' && (
            <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">자산 관리</h2>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">초기값 + 업로드된 거래 증감으로 자산/부채를 계산합니다.</p>
                </div>
              </div>
              <div className="space-y-6">
                {(Object.keys(assetKindLabels) as AssetKind[]).map((kind) => (
                  <AssetManager
                    key={kind}
                    title={assetKindLabels[kind]}
                    collapsed={collapsedAssetKinds[kind]}
                    onToggleCollapsed={() =>
                      setCollapsedAssetKinds((current) => ({
                        ...current,
                        [kind]: !current[kind]
                      }))
                    }
                    assets={assetOptions.filter((assetItem) => assetItem.kind === kind && !assetItem.isArchived)}
                    allAssets={assetOptions}
                    onSaved={refreshAll}
                  />
                ))}
                <AssetManager
                  title="숨김"
                  collapsed={hiddenAssetsCollapsed}
                  onToggleCollapsed={() => setHiddenAssetsCollapsed((current) => !current)}
                  assets={assetOptions.filter((assetItem) => Boolean(assetItem.isArchived))}
                  allAssets={assetOptions}
                  onSaved={refreshAll}
                />
              </div>
            </section>
          )}

          {tab === '연금저축' && (
            <PensionSavingsManager data={pensionSavings.data} onSaved={refreshAll} />
          )}

          {tab === '백업' && (
            <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">업로드된 Excel 파일</h2>
                <span className="text-xs text-zinc-500">{imports.data?.length ?? 0}개</span>
              </div>
              <div className="overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                <table className="min-w-full text-sm">
                  <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
                    <tr><th className="px-3 py-3">파일명</th><th className="px-3 py-3">기간</th><th className="px-3 py-3 text-right">거래</th><th className="px-3 py-3">수정</th><th className="px-3 py-3"></th></tr>
                  </thead>
                  <tbody>
                    {(imports.data ?? []).map((file) => (
                      <tr key={file.sourceFile} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="px-3 py-3 font-medium">{file.sourceFile}</td>
                        <td className="px-3 py-3">{file.firstDate.slice(0, 10)} ~ {file.lastDate.slice(0, 10)}</td>
                        <td className="px-3 py-3 text-right">{file.transactionCount.toLocaleString()}</td>
                        <td className="px-3 py-3"><ReplaceImport sourceFile={file.sourceFile} onDone={refreshAll} /></td>
                        <td className="px-3 py-3 text-right">
                          <button
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-[#ff5a52] dark:border-red-900"
                            onClick={async () => {
                              if (!confirm(`${file.sourceFile} 데이터를 삭제할까요?`)) return;
                              await api.deleteImport(file.sourceFile);
                              await refreshAll();
                            }}
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {tab === '설정' && (
            <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-3 text-sm font-semibold">설정</h2>
              <SettingsForm settings={settings.data} manualPoints={manualNetWorth.data ?? []} onSaved={settings.reload} onManualChanged={refreshAll} />
            </section>
          )}

          {(dashboard.error || transactions.error || metadata.error || imports.error || settings.error || manualNetWorth.error) && (
            <div className="mt-4 rounded-lg bg-rose-100 p-3 text-sm text-rose-700">
              {dashboard.error || transactions.error || metadata.error || imports.error || settings.error || manualNetWorth.error}
            </div>
          )}
          {(dashboard.loading || transactions.loading || calendarTransactions.loading) && <div className="mt-4 text-sm text-zinc-500">불러오는 중...</div>}
        </main>
      </div>
    </div>
  );
}

function PeriodButtons({ periods, selected, onSelect }: { periods: string[]; selected: string; onSelect: (period: string) => void }) {
  return (
    <div className="flex gap-1 overflow-auto rounded-lg border border-zinc-200 bg-white p-1.5 dark:border-zinc-800 dark:bg-zinc-900">
      {periods.map((period) => (
        <button
          key={period}
          className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold transition ${
            selected === period ? 'bg-[#ff5a52] text-white shadow-sm' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
          }`}
          onClick={() => onSelect(period)}
        >
          {period}
        </button>
      ))}
    </div>
  );
}

function CategoryPercentList({ rows }: { rows: Array<{ name: string; value: number }> }) {
  const total = rows.reduce((sum, row) => sum + Number(row.value || 0), 0);
  if (!rows.length) {
    return <div className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-500 dark:bg-zinc-800">표시할 지출이 없습니다.</div>;
  }

  return (
    <div className="max-h-72 overflow-auto rounded-lg border border-zinc-200 text-xs dark:border-zinc-800">
      {rows.map((row, index) => {
        const percent = total ? (row.value / total) * 100 : 0;
        return (
          <div key={row.name} className="flex items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2.5 last:border-b-0 dark:border-zinc-800">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: pieColors[index % pieColors.length] }} />
              <span className="truncate">{row.name}</span>
            </span>
            <span className="shrink-0 font-semibold text-zinc-600 dark:text-zinc-300">{percent.toFixed(1)}%</span>
          </div>
        );
      })}
    </div>
  );
}

function CategoryTooltip({
  active,
  payload
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; payload?: { name?: string } }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const name = item.payload?.name ?? item.name ?? '';
  return (
    <div className="rounded border-2 border-[#ff625a] bg-white px-3 py-2 text-sm shadow-[0_2px_8px_rgba(24,24,27,0.24)] dark:bg-zinc-950">
      <div className="text-zinc-500 dark:text-zinc-400">{name}</div>
      <div className="mt-1 text-base font-semibold text-zinc-700 dark:text-zinc-100">{formatMoney(Number(item.value ?? 0))}</div>
    </div>
  );
}

function NetWorthTooltip({
  active,
  payload,
  label,
  mode
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number | string; payload?: { delta?: number | null; debtRatio?: number } }>;
  label?: string;
  mode: 'monthly' | 'yearly';
}) {
  if (!active || !payload?.length) return null;
  const netWorthPayload = payload.find((item) => item.dataKey === 'netWorth') ?? payload[0];
  const netWorth = Number(netWorthPayload?.value ?? 0);
  const delta = netWorthPayload?.payload?.delta;
  const debtRatio = Number(netWorthPayload?.payload?.debtRatio ?? 0);
  const hasDelta = typeof delta === 'number';
  const deltaLabel = mode === 'monthly' ? '전월 대비' : '전년 대비';

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-950">
      <div className="mb-1 font-semibold text-zinc-700 dark:text-zinc-200">
        {typeof label === 'number' ? dayjs(label).format(mode === 'monthly' ? 'YYYY-MM' : 'YYYY') : label}
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-zinc-500 dark:text-zinc-400">순자산</span>
        <span className="font-semibold">{formatMoney(netWorth)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-4">
        <span className="text-zinc-500 dark:text-zinc-400">{deltaLabel}</span>
        <span className={`font-semibold ${hasDelta && delta < 0 ? 'text-[#ff5a52] dark:text-[#ff817b]' : 'text-emerald-600 dark:text-emerald-300'}`}>
          {hasDelta ? `${delta > 0 ? '+' : ''}${formatMoney(delta)}` : '-'}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-4">
        <span className="text-zinc-500 dark:text-zinc-400">부채율</span>
        <span className="font-semibold text-[#ff8a42] dark:text-orange-300">{debtRatio.toFixed(1)}%</span>
      </div>
    </div>
  );
}

function PensionTooltip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: Array<{ payload?: { principal?: number; profit?: number; total?: number } }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const profit = Number(row?.profit ?? 0);
  const principal = Number(row?.principal ?? 0);
  const returnRate = principal ? (profit / principal) * 100 : null;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-950">
      <div className="mb-1 font-semibold text-zinc-700 dark:text-zinc-200">{typeof label === 'number' ? dayjs(label).format('YYYY-MM') : label}</div>
      <div className="flex items-center justify-between gap-5"><span className="text-zinc-500">원금</span><strong className="text-[#2f8cff]">{formatMoney(Number(row?.principal ?? 0))}</strong></div>
      <div className="mt-1 flex items-center justify-between gap-5"><span className="text-zinc-500">수익</span><strong className={profit < 0 ? 'text-[#ff5a52]' : 'text-[#18a667]'}>{formatMoney(profit)}</strong></div>
      <div className="mt-1 flex items-center justify-between gap-5"><span className="text-zinc-500">수익률</span><strong className="text-[#ff5a52] dark:text-[#ff817b]">{returnRate == null ? '-' : `${returnRate.toFixed(2)}%`}</strong></div>
      <div className="mt-1 flex items-center justify-between gap-5 border-t border-zinc-100 pt-1 dark:border-zinc-800"><span className="text-zinc-500">총액</span><strong>{formatMoney(Number(row?.total ?? 0))}</strong></div>
    </div>
  );
}

function PensionSavingsManager({ data, onSaved }: { data?: PensionSavingsData | null; onSaved: () => Promise<void> }) {
  const totals = [...(data?.rows ?? [])]
    .reverse()
    .reduce(
      (result, row) => ({ principal: result.principal + row.principal, profit: result.profit + row.profit }),
      { principal: data?.initialValue ?? 0, profit: 0 }
    );
  const total = totals.principal + totals.profit;
  const returnRate = totals.principal ? (totals.profit / totals.principal) * 100 : null;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold">연금저축 월별 관리</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{data?.assetName ?? '삼성증권연금저축'} 거래에서 이체는 원금, 수입·기타 거래는 수익으로 자동 반영됩니다.</p>
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-xs sm:grid-cols-4">
            <div><span className="block text-zinc-500">누적 원금</span><strong className="mt-1 block text-sm text-[#2f8cff]">{formatMoney(totals.principal)}</strong></div>
            <div><span className="block text-zinc-500">누적 수익</span><strong className={`mt-1 block text-sm ${totals.profit < 0 ? 'text-[#ff5a52]' : 'text-[#18a667]'}`}>{formatMoney(totals.profit)}</strong></div>
            <div><span className="block text-zinc-500">총액</span><strong className="mt-1 block text-sm">{formatMoney(total)}</strong></div>
            <div><span className="block text-zinc-500">수익률</span><strong className="mt-1 block text-sm text-[#ff5a52] dark:text-[#ff817b]">{returnRate == null ? '-' : `${returnRate.toFixed(2)}%`}</strong></div>
          </div>
        </div>

      </section>

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="overflow-auto">
          <table className="min-w-[820px] w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
              <tr><th className="px-3 py-3">년/월</th><th className="px-3 py-3 text-right">월 원금</th><th className="px-3 py-3 text-right">월 수익(수입)</th><th className="px-3 py-3">계산 기준</th><th className="px-3 py-3 text-right">관리</th></tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).length ? (
                (data?.rows ?? []).map((row) => <PensionMonthRow key={row.period} row={row} onSaved={onSaved} />)
              ) : (
                <tr><td className="px-3 py-5 text-zinc-500" colSpan={5}>연금저축 월별 데이터가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PensionMonthRow({ row, onSaved }: { row: PensionSavingsData['rows'][number]; onSaved: () => Promise<void> }) {
  const [principal, setPrincipal] = useState(String(row.principal));
  const [profit, setProfit] = useState(String(row.profit));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPrincipal(String(row.principal));
    setProfit(String(row.profit));
  }, [row.principal, row.profit]);

  return (
    <tr className="border-t border-zinc-100 dark:border-zinc-800">
      <td className="px-3 py-3 font-semibold">{row.period}</td>
      <td className="px-3 py-3 text-right">
        <input className="w-40 rounded-lg border border-zinc-300 bg-white p-2 text-right dark:border-zinc-700 dark:bg-zinc-950" inputMode="numeric" value={principal} onChange={(event) => setPrincipal(event.target.value.replace(/[^\d.-]/g, ''))} />
        {row.isManual && <div className="mt-1 text-[11px] text-zinc-400">자동 {formatMoney(row.autoPrincipal)}</div>}
      </td>
      <td className="px-3 py-3 text-right">
        <input className={`w-40 rounded-lg border border-zinc-300 bg-white p-2 text-right dark:border-zinc-700 dark:bg-zinc-950 ${Number(profit) < 0 ? 'text-[#ff5a52]' : ''}`} inputMode="numeric" value={profit} onChange={(event) => setProfit(event.target.value.replace(/[^\d.-]/g, ''))} />
        {row.isManual && <div className="mt-1 text-[11px] text-zinc-400">자동 {formatMoney(row.autoProfit)}</div>}
      </td>
      <td className="px-3 py-3"><span className={`rounded px-2 py-1 text-xs font-semibold ${row.isManual ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}`}>{row.isManual ? '수동' : '자동'}</span></td>
      <td className="px-3 py-3 text-right">
        <div className="flex justify-end gap-2">
          {row.isManual && <button className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold dark:border-zinc-700" disabled={saving} onClick={async () => { setSaving(true); try { await api.deletePensionMonth(row.period); await onSaved(); } finally { setSaving(false); } }}>자동값 복원</button>}
          <button className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950" disabled={saving} onClick={async () => { setSaving(true); try { await api.updatePensionMonth({ period: row.period, principal: Number(principal || 0), profit: Number(profit || 0) }); await onSaved(); } finally { setSaving(false); } }}>저장</button>
        </div>
      </td>
    </tr>
  );
}

function AssetManager({
  title,
  collapsed,
  onToggleCollapsed,
  assets,
  allAssets,
  onSaved
}: {
  title: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  assets: Array<{
    id: number;
    name: string;
    kind: AssetKind;
    initialValue: number;
    currentValue: number;
    isHidden: number;
    isArchived: number;
    linkedAsset: string;
    sortOrder: number;
  }>;
  allAssets: Array<{
    id: number;
    name: string;
    kind: AssetKind;
    initialValue: number;
    currentValue: number;
    isHidden: number;
    isArchived: number;
    linkedAsset: string;
    sortOrder: number;
  }>;
  onSaved: () => Promise<void>;
}) {
  const sortedAssets = [...assets].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ko'));

  async function moveAsset(index: number, direction: -1 | 1) {
    const target = sortedAssets[index];
    const neighbor = sortedAssets[index + direction];
    if (!target || !neighbor) return;

    await Promise.all([
      api.updateAsset(target.id, {
        kind: target.kind,
        initialValue: target.initialValue,
        isHidden: Boolean(target.isHidden),
        isArchived: Boolean(target.isArchived),
        linkedAsset: target.linkedAsset,
        sortOrder: neighbor.sortOrder
      }),
      api.updateAsset(neighbor.id, {
        kind: neighbor.kind,
        initialValue: neighbor.initialValue,
        isHidden: Boolean(neighbor.isHidden),
        isArchived: Boolean(neighbor.isArchived),
        linkedAsset: neighbor.linkedAsset,
        sortOrder: target.sortOrder
      })
    ]);
    await onSaved();
  }

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800">
        <button className="flex flex-1 items-center gap-2 px-3 py-3 text-left text-sm font-semibold" onClick={onToggleCollapsed}>
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-zinc-300 text-xs text-zinc-500 dark:border-zinc-700">
            {collapsed ? '＋' : '－'}
          </span>
          {title}
        </button>
        <span className="mr-3 rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-500 dark:bg-zinc-800">{assets.length}개</span>
      </div>
      {collapsed ? null : !assets.length ? (
        <div className="p-4 text-sm text-zinc-500">이 분류에 자산이 없습니다.</div>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-3">자산명</th>
                <th className="px-3 py-3 text-right">최근월 금액</th>
                <th className="px-3 py-3">분류</th>
                <th className="px-3 py-3">연결계좌</th>
                <th className="px-3 py-3 text-right">초기값</th>
                <th className="px-3 py-3 text-center">순서</th>
                <th className="px-3 py-3">계산</th>
                <th className="px-3 py-3">숨김</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {sortedAssets.map((asset, index) => (
                <AssetRow
                  key={asset.id}
                  asset={asset}
                  allAssets={allAssets}
                  canMoveUp={index > 0}
                  canMoveDown={index < sortedAssets.length - 1}
                  onMove={(direction) => moveAsset(index, direction)}
                  onSaved={onSaved}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SettingsForm({
  settings,
  manualPoints,
  onSaved,
  onManualChanged
}: {
  settings?: AppSettings | null;
  manualPoints: ManualNetWorthPoint[];
  onSaved: () => Promise<void>;
  onManualChanged: () => Promise<void>;
}) {
  const [appTitle, setAppTitle] = useState(settings?.appTitle ?? 'EasyMoneyBook Web');
  const [appSubtitle, setAppSubtitle] = useState(settings?.appSubtitle ?? '편한가계부 Excel 백업 분석 공간');
  const [chartGridXMonths, setChartGridXMonths] = useState(String(settings?.chartGridXMonths ?? 12));
  const [chartGridYHundredMillion, setChartGridYHundredMillion] = useState(String(Math.round((settings?.chartGridYWon ?? 100_000_000) / 100_000_000)));
  const [pensionChartGridXMonths, setPensionChartGridXMonths] = useState(String(settings?.pensionChartGridXMonths ?? 12));
  const [pensionChartGridYTenThousand, setPensionChartGridYTenThousand] = useState(String(Math.round((settings?.pensionChartGridYWon ?? 10_000_000) / 10_000)));
  const [manualYear, setManualYear] = useState('');
  const [manualMonth, setManualMonth] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [backupSaving, setBackupSaving] = useState(false);
  const [backupRestoring, setBackupRestoring] = useState(false);

  useEffect(() => {
    if (settings) {
      setAppTitle(settings.appTitle);
      setAppSubtitle(settings.appSubtitle);
      setChartGridXMonths(String(settings.chartGridXMonths ?? 12));
      setChartGridYHundredMillion(String(Math.round((settings.chartGridYWon ?? 100_000_000) / 100_000_000)));
      setPensionChartGridXMonths(String(settings.pensionChartGridXMonths ?? 12));
      setPensionChartGridYTenThousand(String(Math.round((settings.pensionChartGridYWon ?? 10_000_000) / 10_000)));
    }
  }, [settings]);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-4">
        <label className="block text-sm font-medium">
          이름
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950"
            value={appTitle}
            onChange={(event) => setAppTitle(event.target.value)}
          />
        </label>
        <label className="block text-sm font-medium">
          부제목
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950"
            value={appSubtitle}
            onChange={(event) => setAppSubtitle(event.target.value)}
          />
        </label>
        <div>
          <h3 className="mb-2 text-sm font-semibold">월별 순자산 차트</h3>
          <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            X축 점선 간격
            <div className="mt-1 flex items-center gap-2">
              <input
                className="w-full rounded-lg border border-zinc-300 bg-white p-2 text-right dark:border-zinc-700 dark:bg-zinc-950"
                inputMode="numeric"
                value={chartGridXMonths}
                onChange={(event) => setChartGridXMonths(event.target.value.replace(/\D/g, ''))}
              />
              <span className="shrink-0 text-sm text-zinc-500">개월</span>
            </div>
          </label>
          <label className="block text-sm font-medium">
            Y축 점선 간격
            <div className="mt-1 flex items-center gap-2">
              <input
                className="w-full rounded-lg border border-zinc-300 bg-white p-2 text-right dark:border-zinc-700 dark:bg-zinc-950"
                inputMode="numeric"
                value={chartGridYHundredMillion}
                onChange={(event) => setChartGridYHundredMillion(event.target.value.replace(/\D/g, ''))}
              />
              <span className="shrink-0 text-sm text-zinc-500">억원</span>
            </div>
          </label>
          </div>
        </div>
        <div className="border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <h3 className="mb-2 text-sm font-semibold">연금저축 차트</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              X축 점선 간격
              <div className="mt-1 flex items-center gap-2">
                <input
                  className="w-full rounded-lg border border-zinc-300 bg-white p-2 text-right dark:border-zinc-700 dark:bg-zinc-950"
                  inputMode="numeric"
                  value={pensionChartGridXMonths}
                  onChange={(event) => setPensionChartGridXMonths(event.target.value.replace(/\D/g, ''))}
                />
                <span className="shrink-0 text-sm text-zinc-500">개월</span>
              </div>
            </label>
            <label className="block text-sm font-medium">
              Y축 점선 간격
              <div className="mt-1 flex items-center gap-2">
                <input
                  className="w-full rounded-lg border border-zinc-300 bg-white p-2 text-right dark:border-zinc-700 dark:bg-zinc-950"
                  inputMode="numeric"
                  value={pensionChartGridYTenThousand}
                  onChange={(event) => setPensionChartGridYTenThousand(event.target.value.replace(/\D/g, ''))}
                />
                <span className="shrink-0 text-sm text-zinc-500">만원</span>
              </div>
            </label>
          </div>
        </div>
        <button
          className="rounded-lg bg-[#ff5a52] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await api.updateSettings({
                appTitle,
                appSubtitle,
                chartGridXMonths: Number(chartGridXMonths || 12),
                chartGridYWon: Number(chartGridYHundredMillion || 1) * 100_000_000,
                pensionChartGridXMonths: Number(pensionChartGridXMonths || 12),
                pensionChartGridYWon: Number(pensionChartGridYTenThousand || 1000) * 10_000
              });
              await onSaved();
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? '저장 중' : '저장'}
        </button>
      </div>

      <section className="border-t border-zinc-100 pt-5 dark:border-zinc-800">
        <h3 className="text-sm font-semibold">전체 데이터 백업 및 복원</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          거래, 자산, 연금저축, 수동 순자산과 모든 설정을 하나의 전용 백업 파일에 저장합니다.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button
            className="h-10 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950"
            disabled={backupSaving || backupRestoring}
            onClick={async () => {
              setBackupSaving(true);
              try {
                const result = await api.exportBackup();
                window.alert(`${result.transactionCount.toLocaleString()}건의 거래가 포함된 백업 파일을 저장했습니다.`);
              } catch (error) {
                if (!(error instanceof DOMException && error.name === 'AbortError')) {
                  window.alert(error instanceof Error ? error.message : '전체 데이터 백업에 실패했습니다.');
                }
              } finally {
                setBackupSaving(false);
              }
            }}
          >
            {backupSaving ? '백업 중...' : '전체 데이터 백업'}
          </button>
          <label
            className={`inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 ${
              backupSaving || backupRestoring ? 'pointer-events-none opacity-50' : ''
            }`}
          >
            {backupRestoring ? '복원 중...' : '전체 데이터 복원'}
            <input
              className="hidden"
              type="file"
              accept=".embbackup,application/json"
              disabled={backupSaving || backupRestoring}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = '';
                if (!file) return;
                setBackupRestoring(true);
                try {
                  const summary = await api.inspectBackup(file);
                  const exportedAt = summary.exportedAt ? dayjs(summary.exportedAt).format('YYYY-MM-DD HH:mm') : '알 수 없음';
                  const confirmed = window.confirm(
                    `백업 일시: ${exportedAt}\n거래: ${summary.transactionCount.toLocaleString()}건\n자산: ${summary.assetCount.toLocaleString()}개\n업로드 기록: ${summary.importFileCount.toLocaleString()}개\n\n현재 브라우저의 모든 데이터를 이 백업으로 교체할까요?`
                  );
                  if (!confirmed) return;
                  await api.restoreBackup(file);
                  window.alert('전체 데이터 복원이 완료되었습니다. 복원된 화면을 다시 불러옵니다.');
                  window.location.reload();
                } catch (error) {
                  window.alert(error instanceof Error ? error.message : '전체 데이터 복원에 실패했습니다.');
                } finally {
                  setBackupRestoring(false);
                }
              }}
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-[#ff5a52]">복원하면 이 브라우저의 현재 데이터가 백업 파일의 내용으로 교체됩니다.</p>
      </section>

      <details className="group border-t border-zinc-100 pt-5 dark:border-zinc-800">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden">
          과거 순자산 수동 입력
          <span className="text-lg text-zinc-400 transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
        </summary>
        <div className="pt-1">
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto]">
          <input
            className="rounded-lg border border-zinc-300 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950"
            inputMode="numeric"
            placeholder="년"
            value={manualYear}
            onChange={(event) => setManualYear(event.target.value.replace(/\D/g, '').slice(0, 4))}
          />
          <input
            className="rounded-lg border border-zinc-300 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950"
            inputMode="numeric"
            placeholder="월"
            value={manualMonth}
            onChange={(event) => setManualMonth(event.target.value.replace(/\D/g, '').slice(0, 2))}
          />
          <input
            className="rounded-lg border border-zinc-300 bg-white p-2 text-right dark:border-zinc-700 dark:bg-zinc-950"
            inputMode="numeric"
            placeholder="순자산 금액"
            value={manualAmount}
            onChange={(event) => setManualAmount(event.target.value.replace(/[^\d.-]/g, ''))}
          />
          <button
            className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950"
            disabled={manualSaving}
            onClick={async () => {
              const month = manualMonth.padStart(2, '0');
              const period = `${manualYear}-${month}`;
              setManualSaving(true);
              try {
                await api.addManualNetWorth({ period, amount: Number(manualAmount) });
                setManualYear('');
                setManualMonth('');
                setManualAmount('');
                await onManualChanged();
              } catch (error) {
                window.alert(error instanceof Error ? error.message : '수동 순자산 저장에 실패했습니다.');
              } finally {
                setManualSaving(false);
              }
            }}
          >
            추가
          </button>
        </div>
        <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-3">년/월</th>
                <th className="px-3 py-3 text-right">순자산</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {manualPoints.length ? (
                manualPoints.map((point) => (
                  <tr key={point.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-3 py-3 font-medium">{point.period}</td>
                    <td className="px-3 py-3 text-right font-semibold">{formatMoney(point.amount)}</td>
                    <td className="px-3 py-3 text-right">
                      <button
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-[#ff5a52] dark:border-red-900"
                        onClick={async () => {
                          await api.deleteManualNetWorth(point.id);
                          await onManualChanged();
                        }}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-4 text-sm text-zinc-500" colSpan={3}>
                    입력된 과거 순자산이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </div>
      </details>
    </div>
  );
}

function AssetRow({
  asset,
  allAssets,
  canMoveUp,
  canMoveDown,
  onMove,
  onSaved
}: {
  asset: {
    id: number;
    name: string;
    kind: AssetKind;
    initialValue: number;
    currentValue: number;
    isHidden: number;
    isArchived: number;
    linkedAsset: string;
    sortOrder: number;
  };
  allAssets: Array<{
    id: number;
    name: string;
    kind: AssetKind;
    initialValue: number;
    currentValue: number;
    isHidden: number;
    isArchived: number;
    linkedAsset: string;
    sortOrder: number;
  }>;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: -1 | 1) => Promise<void>;
  onSaved: () => Promise<void>;
}) {
  const [kind, setKind] = useState<AssetKind>(asset.kind);
  const [linkedAsset, setLinkedAsset] = useState(asset.linkedAsset ?? '');
  const [initialValue, setInitialValue] = useState(String(Math.round(asset.initialValue ?? 0)));
  const [isExcluded, setIsExcluded] = useState(Boolean(asset.isHidden));
  const [isArchived, setIsArchived] = useState(Boolean(asset.isArchived));
  const [saving, setSaving] = useState(false);

  return (
    <tr className="border-t border-zinc-100 dark:border-zinc-800">
      <td className="px-3 py-3 font-medium">{asset.name}</td>
      <td className={`px-3 py-3 text-right font-semibold ${asset.currentValue < 0 ? 'text-[#ff5a52] dark:text-[#ff817b]' : 'text-[#2f8cff] dark:text-blue-300'}`}>
        {formatMoney(asset.currentValue)}
      </td>
      <td className="px-3 py-3">
        <select className="rounded-lg border border-zinc-300 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950" value={kind} onChange={(event) => setKind(event.target.value as AssetKind)}>
          {(Object.keys(assetKindLabels) as AssetKind[]).map((item) => (
            <option key={item} value={item}>
              {assetKindLabels[item]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-3">
        {kind === 'checkCard' ? (
          <select className="w-44 rounded-lg border border-zinc-300 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950" value={linkedAsset} onChange={(event) => setLinkedAsset(event.target.value)}>
            <option value="">선택 안함</option>
            {allAssets
              .filter((item) => item.id !== asset.id && item.kind !== 'card' && item.kind !== 'checkCard' && item.kind !== 'loan')
              .map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
          </select>
        ) : (
          <span className="text-xs text-zinc-400">-</span>
        )}
      </td>
      <td className="px-3 py-3 text-right">
        <input
          className="w-36 rounded-lg border border-zinc-300 bg-white p-2 text-right dark:border-zinc-700 dark:bg-zinc-950"
          type="number"
          value={initialValue}
          onChange={(event) => setInitialValue(event.target.value)}
        />
      </td>
      <td className="px-3 py-3">
        <div className="flex justify-center gap-1">
          <button
            className="h-8 rounded-lg border border-zinc-300 px-2 text-xs font-semibold disabled:opacity-30 dark:border-zinc-700"
            disabled={!canMoveUp || saving}
            onClick={() => void onMove(-1)}
            title="위로 이동"
          >
            ↑
          </button>
          <button
            className="h-8 rounded-lg border border-zinc-300 px-2 text-xs font-semibold disabled:opacity-30 dark:border-zinc-700"
            disabled={!canMoveDown || saving}
            onClick={() => void onMove(1)}
            title="아래로 이동"
          >
            ↓
          </button>
        </div>
      </td>
      <td className="px-3 py-3">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={!isExcluded} onChange={(event) => setIsExcluded(!event.target.checked)} />
          계산 포함
        </label>
      </td>
      <td className="px-3 py-3">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={isArchived} onChange={(event) => setIsArchived(event.target.checked)} />
          숨김
        </label>
      </td>
      <td className="px-3 py-3 text-right">
        <button
          className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await api.updateAsset(asset.id, {
                kind,
                initialValue: Number(initialValue || 0),
                isHidden: isExcluded,
                isArchived,
                linkedAsset: kind === 'checkCard' ? linkedAsset : '',
                sortOrder: asset.sortOrder
              });
              await onSaved();
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? '저장 중' : '저장'}
        </button>
      </td>
    </tr>
  );
}

function ReplaceImport({ sourceFile, onDone }: { sourceFile: string; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="inline-flex cursor-pointer items-center rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold dark:border-zinc-700">
      {busy ? '수정 중...' : '파일 선택'}
      <input
        className="hidden"
        type="file"
        accept=".xlsx"
        disabled={busy}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setBusy(true);
          try {
            await api.replaceImport(sourceFile, file);
            await onDone();
          } catch (error) {
            window.alert(error instanceof Error ? error.message : '파일 수정에 실패했습니다.');
          } finally {
            setBusy(false);
            event.target.value = '';
          }
        }}
      />
    </label>
  );
}

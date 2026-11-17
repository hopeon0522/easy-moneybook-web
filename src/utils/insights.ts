// 대시보드 화면용 파생 지표.
// 기존 계산 로직(src/api/client.ts)이 돌려준 결과만 읽어서 표시용 숫자를 만듭니다. 저장 데이터나 기존 계산은 바꾸지 않습니다.
import type { AssetKind, DashboardData, Metadata } from '../types/domain';

export type AllocationGroup = {
  key: 'savings' | 'investment' | 'realEstate' | 'other' | 'card' | 'loan';
  label: string;
  value: number;
  share: number;
  color: string;
  liability: boolean;
};

const groupMeta: Record<AllocationGroup['key'], { label: string; color: string; liability: boolean }> = {
  savings: { label: '현금·예금', color: '#24489b', liability: false },
  investment: { label: '투자', color: '#3f86e0', liability: false },
  realEstate: { label: '부동산', color: '#22a3b8', liability: false },
  other: { label: '기타 자산', color: '#8fa3c0', liability: false },
  card: { label: '카드 대금', color: '#d08a2e', liability: true },
  loan: { label: '대출', color: '#c94a4a', liability: true }
};

const kindToGroup: Record<AssetKind, AllocationGroup['key'] | null> = {
  savings: 'savings',
  investment: 'investment',
  realEstate: 'realEstate',
  other: 'other',
  checkCard: null,
  card: 'card',
  loan: 'loan'
};

type MetaAsset = Metadata['assets'][number];

function visibleAssets(assets: MetaAsset[] = []) {
  return assets.filter((asset) => !asset.isHidden && !asset.isArchived);
}

export function assetAllocation(assets: MetaAsset[] = []) {
  const totals = new Map<AllocationGroup['key'], number>();
  for (const asset of visibleAssets(assets)) {
    const group = kindToGroup[asset.kind];
    if (!group) continue;
    const value = groupMeta[group].liability ? Math.abs(asset.currentValue) : Math.max(0, asset.currentValue);
    totals.set(group, (totals.get(group) ?? 0) + value);
  }
  const assetTotal = (['savings', 'investment', 'realEstate', 'other'] as const).reduce((sum, key) => sum + (totals.get(key) ?? 0), 0);
  const liabilityTotal = (['card', 'loan'] as const).reduce((sum, key) => sum + (totals.get(key) ?? 0), 0);
  const groups: AllocationGroup[] = (Object.keys(groupMeta) as AllocationGroup['key'][])
    .map((key) => {
      const value = totals.get(key) ?? 0;
      const base = groupMeta[key].liability ? liabilityTotal : assetTotal;
      return { key, ...groupMeta[key], value, share: base ? value / base : 0 };
    })
    .filter((group) => group.value > 0);
  return { groups, assetTotal, liabilityTotal };
}

export function topHoldings(assets: MetaAsset[] = [], limit = 5) {
  const rows = visibleAssets(assets)
    .filter((asset) => asset.kind === 'savings' || asset.kind === 'investment' || asset.kind === 'realEstate' || asset.kind === 'other')
    .map((asset) => ({ name: asset.name, kind: asset.kind, value: Math.max(0, asset.currentValue) }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return rows.slice(0, limit).map((row) => ({ ...row, share: total ? row.value / total : 0 }));
}

export type Change = { amount: number; rate: number | null; fromMonth: string } | null;

function changeBetween(line: DashboardData['assetLine'], back: number): Change {
  if (line.length < back + 1) return null;
  const current = line[line.length - 1];
  const previous = line[line.length - 1 - back];
  const amount = current.netWorth - previous.netWorth;
  return { amount, rate: previous.netWorth > 0 ? amount / previous.netWorth : null, fromMonth: previous.month };
}

export function netWorthChanges(line: DashboardData['assetLine'] = []) {
  return {
    month: changeBetween(line, 1),
    year: changeBetween(line, 12)
  };
}

export function savingsRates(cashflow: DashboardData['monthlyCashflow'] = []) {
  const withData = cashflow.filter((row) => row.hasData);
  const latest = withData[0];
  const income12 = withData.reduce((sum, row) => sum + row.income, 0);
  const net12 = withData.reduce((sum, row) => sum + row.net, 0);
  const expense12 = withData.reduce((sum, row) => sum + row.expense, 0);
  return {
    latest: latest && latest.income > 0 ? latest.net / latest.income : null,
    trailing: income12 > 0 ? net12 / income12 : null,
    averageExpense: withData.length ? expense12 / withData.length : 0,
    months: withData.length
  };
}

export function liquidityMonths(assets: MetaAsset[] = [], averageExpense: number) {
  const cash = visibleAssets(assets)
    .filter((asset) => asset.kind === 'savings')
    .reduce((sum, asset) => sum + Math.max(0, asset.currentValue), 0);
  return { cash, months: averageExpense > 0 ? cash / averageExpense : null };
}

export function latestDebtRatio(line: DashboardData['debtRatioLine'] = []) {
  return line.length ? line[line.length - 1].debtRatio : null;
}

export function sparklinePath(values: number[], width = 220, height = 56, pad = 4) {
  if (values.length < 2) return { line: '', area: '' };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = pad + (index * (width - pad * 2)) / (values.length - 1);
    const y = pad + (1 - (value - min) / span) * (height - pad * 2);
    return [Number(x.toFixed(1)), Number(y.toFixed(1))] as const;
  });
  const line = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x} ${y}`).join(' ');
  const area = `${line} L${points[points.length - 1][0]} ${height} L${points[0][0]} ${height} Z`;
  return { line, area };
}

export function formatPercent(value: number | null, digits = 1) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatSigned(value: number, format: (value: number) => string) {
  if (value > 0) return `+${format(value)}`;
  return format(value);
}

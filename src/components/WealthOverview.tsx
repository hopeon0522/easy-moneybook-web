import { useMemo } from 'react';
import type { DashboardData, Metadata } from '../types/domain';
import { formatMoney } from '../utils/format';
import {
  assetAllocation,
  formatPercent,
  formatSigned,
  latestDebtRatio,
  liquidityMonths,
  netWorthChanges,
  savingsRates,
  sparklinePath,
  topHoldings,
  type Change
} from '../utils/insights';

type Props = {
  data?: DashboardData | null;
  assets?: Metadata['assets'];
};

function ChangeChip({ change, label }: { change: Change; label: string }) {
  if (!change) return <span className="delta-chip is-flat">{label} —</span>;
  const tone = change.amount > 0 ? 'is-up' : change.amount < 0 ? 'is-down' : 'is-flat';
  const arrow = change.amount > 0 ? '▲' : change.amount < 0 ? '▼' : '';
  return (
    <span className={`delta-chip ${tone}`} title={`${change.fromMonth} 대비`}>
      <span className="delta-label">{label}</span>
      {arrow} {formatSigned(change.amount, formatMoney)}
      {change.rate != null && <span className="delta-rate">({formatSigned(change.rate * 100, (value) => `${value.toFixed(1)}%`)})</span>}
    </span>
  );
}

function Donut({ groups }: { groups: Array<{ key: string; share: number; color: string }> }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <svg className="alloc-donut" viewBox="0 0 120 120" role="img" aria-label="자산 구성 비중">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth="16" />
      {groups.map((group) => {
        const length = group.share * circumference;
        const segment = (
          <circle
            key={group.key}
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={group.color}
            strokeWidth="16"
            strokeDasharray={`${Math.max(0, length - 1.5)} ${circumference}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 60 60)"
          />
        );
        offset += length;
        return segment;
      })}
    </svg>
  );
}

export function WealthOverview({ data, assets }: Props) {
  const summary = data?.summary;
  const view = useMemo(() => {
    const allocation = assetAllocation(assets);
    const rates = savingsRates(data?.monthlyCashflow);
    return {
      allocation,
      holdings: topHoldings(assets),
      changes: netWorthChanges(data?.assetLine),
      rates,
      liquidity: liquidityMonths(assets, rates.averageExpense),
      debtRatio: latestDebtRatio(data?.debtRatioLine),
      spark: sparklinePath((data?.assetLine ?? []).slice(-24).map((row) => row.netWorth), 260, 64)
    };
  }, [assets, data]);
  const assetGroups = view.allocation.groups.filter((group) => !group.liability);
  const liabilityGroups = view.allocation.groups.filter((group) => group.liability);
  const period = summary?.latestPeriod ? summary.latestPeriod.replace('-', '. ') : '';

  return (
    <>
      <section className="wealth-overview">
        <div className="wealth-hero">
          <div className="wealth-headline">
            <span className="eyebrow">순자산 · Net Worth</span>
            <strong>{formatMoney(summary?.netWorth ?? 0)}</strong>
            <div className="delta-row">
              <ChangeChip change={view.changes.month} label="전월" />
              <ChangeChip change={view.changes.year} label="1년" />
            </div>
            <small>{period ? `${period} 기준 · 이 브라우저에 저장된 데이터` : '데이터 없음'}</small>
          </div>
          {view.spark.line && (
            <svg className="wealth-spark" viewBox="0 0 260 64" preserveAspectRatio="none" aria-hidden="true">
              <path d={view.spark.area} className="spark-area" />
              <path d={view.spark.line} className="spark-line" />
            </svg>
          )}
          <div className="wealth-breakdown">
            <div><span>총자산</span><strong>{formatMoney(summary?.totalAssets ?? 0)}</strong></div>
            <div><span>총부채</span><strong className="liability-value">{formatMoney(summary?.liabilities ?? 0)}</strong></div>
          </div>
        </div>

        <div className="allocation-card">
          <div className="card-head">
            <h2>자산 구성</h2>
            <span className="muted-note">자산 탭 기준 현재 잔액</span>
          </div>
          {assetGroups.length ? (
            <div className="alloc-body">
              <div className="alloc-chart">
                <Donut groups={assetGroups} />
                <div className="alloc-center"><span>자산</span><strong>{Math.round(view.allocation.assetTotal / 10000).toLocaleString('ko-KR')}만</strong></div>
              </div>
              <ul className="alloc-list">
                {assetGroups.map((group) => (
                  <li key={group.key}>
                    <i style={{ background: group.color }} />
                    <span>{group.label}</span>
                    <b>{formatPercent(group.share)}</b>
                    <em>{formatMoney(group.value)}</em>
                  </li>
                ))}
                {liabilityGroups.map((group) => (
                  <li key={group.key} className="is-liability">
                    <i style={{ background: group.color }} />
                    <span>{group.label}</span>
                    <b>부채</b>
                    <em>{formatMoney(group.value)}</em>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="empty-note">자산 탭에 계좌가 등록되면 구성 비중이 표시됩니다.</p>
          )}
        </div>
      </section>

      <section className="kpi-grid" aria-label="핵심 지표">
        <div className="kpi">
          <span>저축률 · 이번 달</span>
          <strong className={view.rates.latest != null && view.rates.latest < 0 ? 'text-expense' : ''}>{formatPercent(view.rates.latest)}</strong>
          <small>최근 {view.rates.months}개월 평균 {formatPercent(view.rates.trailing)}</small>
        </div>
        <div className="kpi">
          <span>월평균 지출</span>
          <strong>{formatMoney(view.rates.averageExpense)}</strong>
          <small>최근 {view.rates.months}개월 기준</small>
        </div>
        <div className="kpi">
          <span>비상자금 커버리지</span>
          <strong>{view.liquidity.months == null ? '—' : `${view.liquidity.months.toFixed(1)}개월`}</strong>
          <small>현금·예금 {formatMoney(view.liquidity.cash)} ÷ 월평균 지출</small>
        </div>
        <div className="kpi">
          <span>부채비율</span>
          <strong className={view.debtRatio != null && view.debtRatio >= 100 ? 'text-expense' : ''}>{view.debtRatio == null ? '—' : `${view.debtRatio.toFixed(1)}%`}</strong>
          <small>부채 ÷ 자산 (최근 월)</small>
        </div>
      </section>

      {view.holdings.length > 0 && (
        <section className="holdings-card">
          <div className="card-head">
            <h2>주요 보유 자산</h2>
            <span className="muted-note">상위 {view.holdings.length}개 · 자산 대비 비중</span>
          </div>
          <ol className="holdings-list">
            {view.holdings.map((row) => (
              <li key={row.name}>
                <span className="holding-name">{row.name}</span>
                <span className="holding-bar"><i style={{ width: `${Math.max(2, row.share * 100)}%` }} /></span>
                <b>{formatPercent(row.share)}</b>
                <em>{formatMoney(row.value)}</em>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

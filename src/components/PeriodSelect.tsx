export function PeriodSelect({ periods, selected, onSelect, yearly = false, label = '' }: { periods: string[]; selected: string; onSelect: (period: string) => void; yearly?: boolean; label?: string }) {
  const years = [...new Set(periods.map(period => period.slice(0, 4)))].sort().reverse();
  const year = selected.slice(0, 4);
  const months = periods.filter(period => period.startsWith(`${year}-`)).sort();
  return <div className="period-select-group">
    <select aria-label={`${label} 연도 선택`.trim()} className="category-period-select" value={year} disabled={!years.length} onChange={event => {
      const nextYear = event.target.value;
      const candidates = periods.filter(period => period.startsWith(`${nextYear}-`)).sort();
      const matching = `${nextYear}-${selected.slice(5, 7)}`;
      onSelect(yearly ? nextYear : candidates.includes(matching) ? matching : candidates[candidates.length - 1]);
    }}>{!years.length && <option value="">데이터 없음</option>}{years.map(value => <option key={value} value={value}>{value}년</option>)}</select>
    {!yearly && <select aria-label={`${label} 월 선택`.trim()} className="category-period-select" value={selected} disabled={!months.length} onChange={event => onSelect(event.target.value)}>{!months.length && <option value="">데이터 없음</option>}{months.map(period => <option key={period} value={period}>{Number(period.slice(5, 7))}월</option>)}</select>}
  </div>;
}

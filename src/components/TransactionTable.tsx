import { Transaction } from '../types/domain';
import { formatMoney, typeLabel } from '../utils/format';
import { useMemo, useState } from 'react';

export function TransactionTable({ rows }: { rows: Transaction[] }) {
  const [sortKey, setSortKey] = useState<'date' | 'type' | 'category' | 'asset' | 'merchant' | 'amount'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aValue = sortKey === 'merchant' ? a.merchant || a.memo : a[sortKey];
      const bValue = sortKey === 'merchant' ? b.merchant || b.memo : b[sortKey];
      const result =
        typeof aValue === 'number' && typeof bValue === 'number'
          ? aValue - bValue
          : String(aValue).localeCompare(String(bValue), 'ko');
      return sortDir === 'asc' ? result : -result;
    });
  }, [rows, sortDir, sortKey]);

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortDir((value) => (value === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'amount' ? 'desc' : 'asc');
  }

  const header = (key: typeof sortKey, label: string, align = '') => (
    <button className={`w-full text-left ${align}`} onClick={() => toggleSort(key)}>
      {label} {sortKey === key ? (sortDir === 'asc' ? '▲' : '▼') : ''}
    </button>
  );

  return (
    <div className="tx-wrap overflow-auto">
      <table className="tx-table min-w-full text-sm">
        <thead>
          <tr>
            <th className="tx-date">{header('date', '날짜')}</th>
            <th className="tx-type">{header('type', '구분')}</th>
            <th className="tx-memo">{header('merchant', '내용')}</th>
            <th className="tx-cat">{header('category', '카테고리')}</th>
            <th className="tx-asset">{header('asset', '자산')}</th>
            <th className="tx-amount text-right">{header('amount', '금액', 'text-right')}</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr key={row.id}>
              <td className="tx-date" title={row.date.slice(0, 10)}>{shortDate(row.date)}</td>
              <td className="tx-type"><span className={`tx-badge is-${row.type}`}>{typeLabel(row.type)}</span></td>
              <td className="tx-memo">{row.merchant || row.memo || row.category || '-'}</td>
              <td className="tx-cat">{row.category || '-'}{row.subcategory ? <span className="tx-sub"> · {row.subcategory}</span> : null}</td>
              <td className="tx-asset">{row.asset || '-'}</td>
              <td className={`tx-amount text-right ${row.type === 'income' ? 'text-income' : row.type === 'expense' ? 'is-expense' : 'is-transfer'}`}>
                {formatMoney(row.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

function shortDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return value.slice(0, 10);
  const weekday = weekdays[new Date(year, month - 1, day).getDay()];
  return `${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')} (${weekday})`;
}

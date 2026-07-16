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
    <div className="overflow-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <table className="min-w-full text-sm">
        <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
          <tr>
            <th className="px-3 py-3">{header('date', '날짜')}</th>
            <th className="px-3 py-3">{header('type', '구분')}</th>
            <th className="px-3 py-3">{header('category', '카테고리')}</th>
            <th className="px-3 py-3">{header('asset', '자산')}</th>
            <th className="px-3 py-3">{header('merchant', '내용')}</th>
            <th className="px-3 py-3 text-right">{header('amount', '금액', 'text-right')}</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr key={row.id} className="border-t border-zinc-100 dark:border-zinc-800">
              <td className="whitespace-nowrap px-3 py-3 text-zinc-500 dark:text-zinc-400">{row.date.slice(0, 10)}</td>
              <td className="px-3 py-3 text-zinc-500 dark:text-zinc-400">{typeLabel(row.type)}</td>
              <td className="px-3 py-3 text-zinc-500 dark:text-zinc-400">{row.category || '-'}</td>
              <td className="px-3 py-3 text-zinc-500 dark:text-zinc-400">{row.asset || '-'}</td>
              <td className="px-3 py-3 font-medium text-zinc-800 dark:text-zinc-100">{row.merchant || row.memo || '-'}</td>
              <td className={`px-3 py-3 text-right font-semibold ${row.type === 'income' ? 'text-[#2f8cff]' : row.type === 'expense' ? 'text-[#ff5a52]' : 'text-zinc-500 dark:text-zinc-400'}`}>
                {formatMoney(row.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

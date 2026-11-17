interface StatCardProps {
  label: string;
  value: string;
  tone?: 'default' | 'blue' | 'red' | 'green';
}

export function StatCard({ label, value, tone = 'default' }: StatCardProps) {
  const toneClass = {
    default: 'text-zinc-950 dark:text-zinc-50',
    blue: 'text-income',
    red: 'text-expense',
    green: 'text-gain'
  }[tone];

  return (
    <div className={`stat-summary tone-${tone}`}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${toneClass}`}>{value}</div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  tone?: 'default' | 'blue' | 'red' | 'green';
}

export function StatCard({ label, value, tone = 'default' }: StatCardProps) {
  const toneClass = {
    default: 'text-zinc-950 dark:text-zinc-50',
    blue: 'text-[#2f8cff] dark:text-blue-300',
    red: 'text-[#ff5a52] dark:text-[#ff817b]',
    green: 'text-emerald-600 dark:text-emerald-300'
  }[tone];

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className={`mt-2 text-lg font-semibold tracking-normal xl:text-xl ${toneClass}`}>{value}</div>
    </div>
  );
}

import type { AnnualCategoryData, Transaction } from '../types/domain';

/** Aggregate signed cashflow by category; averages use months with imported transactions. */
export function annualCategories(transactions: Transaction[], year: string, type: 'income' | 'expense'): AnnualCategoryData {
  const available = new Set<number>();
  const categories = new Map<string, number[]>();
  let income = 0;
  let expense = 0;
  for (const row of transactions) {
    if (row.date.slice(0, 4) !== year) continue;
    const month = Number(row.date.slice(5, 7)) - 1;
    if (month < 0 || month > 11 || !Number.isInteger(month)) continue;
    available.add(month);
    if (row.type === 'income') income += row.amount;
    if (row.type === 'expense') expense -= row.amount;
    if (row.type !== type) continue;
    const amounts = categories.get(row.category || '미분류') ?? Array<number>(12).fill(0);
    amounts[month] += type === 'expense' ? -row.amount : row.amount;
    categories.set(row.category || '미분류', amounts);
  }
  const total = type === 'income' ? income : expense;
  return {
    year, income, expense, availableMonths: [...available].sort((a, b) => a - b),
    rows: [...categories].map(([name, months]) => {
      const amount = months.reduce((sum, value) => sum + value, 0);
      return { name, months, total: amount, average: available.size ? amount / available.size : 0, percent: total > 0 ? amount / total * 100 : 0 };
    }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  };
}

export const money = new Intl.NumberFormat('ko-KR', {
  style: 'currency',
  currency: 'KRW',
  maximumFractionDigits: 0
});

export function formatMoney(value: number): string {
  return money.format(Math.round(value || 0));
}

export function typeLabel(type: string): string {
  if (type === 'income') return '수입';
  if (type === 'expense') return '지출';
  return '이체';
}

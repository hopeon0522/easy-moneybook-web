import { AppSettings, AssetKind, CategoryExpenseData, DashboardData, ImportFile, ManualNetWorthPoint, Metadata, Transaction } from '../types/domain';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? '요청 처리 중 오류가 발생했습니다.');
  }
  return data as T;
}

export const api = {
  dashboard: () => request<DashboardData>('/api/dashboard'),
  settings: () => request<AppSettings>('/api/settings'),
  updateSettings: (input: AppSettings) =>
    request<AppSettings>('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    }),
  manualNetWorth: () => request<ManualNetWorthPoint[]>('/api/manual-net-worth'),
  addManualNetWorth: (input: { period: string; amount: number }) =>
    request<ManualNetWorthPoint>('/api/manual-net-worth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    }),
  deleteManualNetWorth: (id: number) => request<{ ok: true }>(`/api/manual-net-worth/${id}`, { method: 'DELETE' }),
  metadata: () => request<Metadata>('/api/metadata'),
  updateAsset: (
    id: number,
    input: {
      kind: AssetKind;
      initialValue: number;
      isHidden: boolean;
      isArchived: boolean;
      linkedAsset: string;
      sortOrder: number;
    }
  ) =>
    request<{ ok: true }>(`/api/assets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    }),
  periods: () => request<string[]>('/api/periods'),
  imports: () => request<ImportFile[]>('/api/imports'),
  deleteImport: (sourceFile: string) =>
    request<{ ok: true }>(`/api/imports/${encodeURIComponent(sourceFile)}`, { method: 'DELETE' }),
  replaceImport: (sourceFile: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return request<{ count: number; sourceFile: string }>(`/api/imports/${encodeURIComponent(sourceFile)}/replace`, {
      method: 'POST',
      body
    });
  },
  categoryExpense: (period = '', type: 'income' | 'expense' = 'expense') => {
    const params = new URLSearchParams();
    if (period) params.set('period', period);
    params.set('type', type);
    return request<CategoryExpenseData>(`/api/categories/monthly?${params.toString()}`);
  },
  statistics: () => request<Record<string, Array<{ name?: string; weekday?: string; value: number }>>>('/api/statistics'),
  transactions: (query = '') => request<Transaction[]>(`/api/transactions${query}`),
  uploadExcel: (file: File) => {
    const body = new FormData();
    body.append('file', file);
    return request<{ count: number; sourceFile: string }>('/api/imports/excel', {
      method: 'POST',
      body
    });
  }
};

import {
  AppSettings,
  AssetKind,
  CategoryExpenseData,
  DashboardData,
  ImportFile,
  ManualNetWorthPoint,
  Metadata,
  Transaction
} from '../types/domain';
import { parseEasyMoneyBookFile } from '../lib/excelParser';
import { currentUserId, supabase } from '../lib/supabase';

type AssetRow = {
  id: number;
  name: string;
  kind: AssetKind;
  initial_value: number;
  is_hidden: boolean;
  is_archived: boolean;
  linked_asset: string;
  sort_order: number;
};

type LegacyPayload = {
  version: number;
  transactions: Array<Record<string, unknown>>;
  assets: Array<Record<string, unknown>>;
  categories: Array<Record<string, unknown>>;
  tags: Array<Record<string, unknown>>;
  settings: Array<Record<string, unknown>>;
  manualNetWorth: Array<Record<string, unknown>>;
  importFiles: Array<Record<string, unknown>>;
};

const settingsDefaults: AppSettings = {
  appTitle: 'EasyMoneyBook Web',
  appSubtitle: '편한가계부 Excel 백업 분석 공간',
  chartGridXMonths: 12,
  chartGridYWon: 100_000_000
};

let transactionCache: Transaction[] | null = null;
let transactionLoad: Promise<Transaction[]> | null = null;

function fail(error: { message?: string } | null, fallback = '데이터 처리 중 오류가 발생했습니다.'): never {
  throw new Error(error?.message || fallback);
}

function mapTransaction(row: Record<string, unknown>): Transaction {
  return {
    id: Number(row.id),
    date: String(row.date ?? ''),
    amount: Number(row.amount ?? 0),
    type: row.type as Transaction['type'],
    category: String(row.category ?? ''),
    subcategory: String(row.subcategory ?? ''),
    asset: String(row.asset ?? ''),
    counterAsset: String(row.counter_asset ?? ''),
    memo: String(row.memo ?? ''),
    tag: String(row.tag ?? ''),
    balance: row.balance == null ? null : Number(row.balance),
    merchant: String(row.merchant ?? ''),
    sourceFile: String(row.source_file ?? ''),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? '')
  };
}

async function allTransactions(): Promise<Transaction[]> {
  if (transactionCache) return transactionCache;
  if (transactionLoad) return transactionLoad;
  transactionLoad = (async () => {
    const rows: Transaction[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase.from('transactions').select('*').order('id').range(from, from + pageSize - 1);
      if (error) fail(error);
      rows.push(...(data ?? []).map((row) => mapTransaction(row)));
      if ((data?.length ?? 0) < pageSize) break;
    }
    transactionCache = rows;
    transactionLoad = null;
    return rows;
  })().catch((error) => {
    transactionLoad = null;
    throw error;
  });
  return transactionLoad;
}

function invalidateTransactions() {
  transactionCache = null;
  transactionLoad = null;
}

async function assetRows(): Promise<AssetRow[]> {
  const { data, error } = await supabase.from('assets').select('*').order('is_archived').order('is_hidden').order('sort_order').order('name');
  if (error) fail(error);
  return (data ?? []) as AssetRow[];
}

function inferAssetKind(name: string): AssetKind {
  if (/체크카드|하나머니|네이버페이머니/.test(name)) return 'checkCard';
  if (/카드|백화점|하이패스/.test(name)) return 'card';
  if (/대출|담보|전세|마이너스/.test(name)) return 'loan';
  if (/증권|연금|ISA|주식|생명|출자금|청약/.test(name)) return 'investment';
  if (/통장|입출금|예금|저축|페이|머니|현금|수원페이|은행|카카오|하나|KB|우리|새마을/.test(name)) return 'savings';
  return 'other';
}

function yearlyRows<T extends { month: string }>(rows: T[]): Array<T & { year: string }> {
  const years = new Map<string, T & { year: string }>();
  for (const row of rows) {
    const year = row.month.slice(0, 4);
    const current = years.get(year);
    if (!current || row.month > current.month) years.set(year, { ...row, year });
  }
  return [...years.values()].sort((a, b) => a.year.localeCompare(b.year));
}

async function dashboard(): Promise<DashboardData> {
  const [transactions, assets, manual] = await Promise.all([allTransactions(), assetRows(), api.manualNetWorth()]);
  const months = [...new Set(transactions.map((row) => row.date.slice(0, 7)).filter(Boolean))].sort();
  const latestPeriod = months.at(-1) ?? '';
  const latestRows = transactions.filter((row) => row.date.slice(0, 7) === latestPeriod);
  const monthIncome = latestRows.filter((row) => row.type === 'income').reduce((sum, row) => sum + row.amount, 0);
  const monthExpense = latestRows.filter((row) => row.type === 'expense').reduce((sum, row) => sum - row.amount, 0);
  const includedAssets = assets.filter((asset) => !asset.is_hidden);
  const liabilityKinds = new Set<AssetKind>(['card', 'loan']);
  const values = includedAssets.map((asset) => ({
    kind: asset.kind,
    value: Number(asset.initial_value) + transactions.filter((row) => row.asset === asset.name && (!latestPeriod || row.date.slice(0, 7) <= latestPeriod)).reduce((sum, row) => sum + row.amount, 0)
  }));
  const totalAssets = values.filter((row) => !liabilityKinds.has(row.kind)).reduce((sum, row) => sum + Math.max(0, row.value), 0);
  const liabilities = values.filter((row) => liabilityKinds.has(row.kind)).reduce((sum, row) => sum + Math.abs(row.value), 0);
  const netWorth = values.filter((row) => !liabilityKinds.has(row.kind)).reduce((sum, row) => sum + row.value, 0) - liabilities;

  const visibleNames = new Set(includedAssets.map((asset) => asset.name));
  const initialNetWorth = includedAssets.reduce(
    (sum, asset) => sum + (liabilityKinds.has(asset.kind) ? -Math.abs(Number(asset.initial_value)) : Number(asset.initial_value)),
    0
  );
  let runningNetWorth = initialNetWorth;
  const calculatedLine = months.map((month) => {
    runningNetWorth += transactions
      .filter((row) => row.date.slice(0, 7) === month && visibleNames.has(row.asset))
      .reduce((sum, row) => sum + row.amount, 0);
    return { month, netWorth: runningNetWorth, isManual: 0 };
  });
  const assetLine = [
    ...manual.map((row) => ({ month: row.period, netWorth: row.amount, isManual: 1 })),
    ...calculatedLine
  ].sort((a, b) => a.month.localeCompare(b.month));

  const debtRatioLine = months.map((month) => {
    const monthValues = includedAssets.map((asset) => ({
      kind: asset.kind,
      value: Number(asset.initial_value) + transactions.filter((row) => row.asset === asset.name && row.date.slice(0, 7) <= month).reduce((sum, row) => sum + row.amount, 0)
    }));
    const monthAssets = monthValues.filter((row) => !liabilityKinds.has(row.kind)).reduce((sum, row) => sum + Math.max(row.value, 0), 0);
    const monthLiabilities = monthValues.filter((row) => liabilityKinds.has(row.kind)).reduce((sum, row) => sum + Math.abs(row.value), 0);
    return { month, debtRatio: monthAssets ? (monthLiabilities * 100) / monthAssets : 0 };
  });

  const categoryTotals = new Map<string, number>();
  for (const row of latestRows.filter((item) => item.type === 'expense')) {
    categoryTotals.set(row.category, (categoryTotals.get(row.category) ?? 0) - row.amount);
  }
  const categoryPie = [...categoryTotals.entries()]
    .map(([name, value]) => ({ name, value }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);
  const monthlyBars = months.slice(-6).map((month) => {
    const rows = transactions.filter((row) => row.date.slice(0, 7) === month);
    return {
      month,
      income: rows.filter((row) => row.type === 'income').reduce((sum, row) => sum + row.amount, 0),
      expense: rows.filter((row) => row.type === 'expense').reduce((sum, row) => sum - row.amount, 0)
    };
  });
  const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 20);

  return {
    summary: { latestPeriod, monthIncome, monthExpense, monthNet: monthIncome - monthExpense, totalAssets, liabilities, netWorth },
    recent,
    categoryPie,
    monthlyBars,
    assetLine,
    assetLineYearly: yearlyRows(assetLine),
    debtRatioLine,
    debtRatioLineYearly: yearlyRows(debtRatioLine)
  };
}

async function settings(): Promise<AppSettings> {
  const { data, error } = await supabase.from('settings').select('key,value');
  if (error) fail(error);
  const values = Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
  return {
    appTitle: values.appTitle || settingsDefaults.appTitle,
    appSubtitle: values.appSubtitle || settingsDefaults.appSubtitle,
    chartGridXMonths: Math.max(1, Number(values.chartGridXMonths || settingsDefaults.chartGridXMonths)),
    chartGridYWon: Math.max(100_000_000, Number(values.chartGridYWon || settingsDefaults.chartGridYWon))
  };
}

async function updateSettings(input: AppSettings): Promise<AppSettings> {
  const userId = await currentUserId();
  const next = {
    appTitle: input.appTitle.trim() || settingsDefaults.appTitle,
    appSubtitle: input.appSubtitle.trim() || settingsDefaults.appSubtitle,
    chartGridXMonths: Math.max(1, Math.round(Number(input.chartGridXMonths || 12))),
    chartGridYWon: Math.max(100_000_000, Math.round(Number(input.chartGridYWon || 100_000_000) / 100_000_000) * 100_000_000)
  };
  const now = new Date().toISOString();
  const rows = Object.entries(next).map(([key, value]) => ({ user_id: userId, key, value: String(value), updated_at: now }));
  const { error } = await supabase.from('settings').upsert(rows, { onConflict: 'user_id,key' });
  if (error) fail(error);
  return next;
}

async function manualNetWorth(): Promise<ManualNetWorthPoint[]> {
  const { data, error } = await supabase.from('manual_net_worth').select('*').order('period');
  if (error) fail(error);
  return (data ?? []).map((row) => ({ id: Number(row.id), period: row.period, amount: Number(row.amount), createdAt: row.created_at, updatedAt: row.updated_at }));
}

async function metadata(): Promise<Metadata> {
  const [assets, categoriesResult, tagsResult, transactions] = await Promise.all([
    assetRows(),
    supabase.from('categories').select('*').order('name'),
    supabase.from('tags').select('*').order('name'),
    allTransactions()
  ]);
  if (categoriesResult.error) fail(categoriesResult.error);
  if (tagsResult.error) fail(tagsResult.error);
  const latest = transactions.map((row) => row.date.slice(0, 7)).sort().at(-1) ?? '';
  const ownValues = new Map<string, number>();
  for (const row of transactions) {
    if (!latest || row.date.slice(0, 7) <= latest) ownValues.set(row.asset, (ownValues.get(row.asset) ?? 0) + row.amount);
  }
  const linkedValues = new Map<string, number>();
  for (const asset of assets.filter((row) => row.kind === 'checkCard' && row.linked_asset)) {
    linkedValues.set(asset.linked_asset, (linkedValues.get(asset.linked_asset) ?? 0) + (ownValues.get(asset.name) ?? 0));
  }
  return {
    assets: assets.map((asset) => ({
      id: Number(asset.id),
      name: asset.name,
      kind: asset.kind,
      initialValue: Number(asset.initial_value),
      currentValue:
        asset.kind === 'checkCard'
          ? Number(asset.initial_value)
          : Number(asset.initial_value) + (ownValues.get(asset.name) ?? 0) + (linkedValues.get(asset.name) ?? 0),
      isHidden: asset.is_hidden ? 1 : 0,
      isArchived: asset.is_archived ? 1 : 0,
      linkedAsset: asset.linked_asset,
      sortOrder: Number(asset.sort_order)
    })),
    categories: (categoriesResult.data ?? []).map((row) => ({ id: Number(row.id), name: row.name, parentName: row.parent_name, type: row.type })),
    tags: (tagsResult.data ?? []).map((row) => ({ id: Number(row.id), name: row.name }))
  };
}

async function importExcel(file: File, sourceFile = file.name) {
  const parsed = (await parseEasyMoneyBookFile(file)).map((row) => ({ ...row, sourceFile }));
  const periods = new Set(parsed.map((row) => row.date.slice(0, 7)).filter(Boolean));
  if (periods.size > 1) {
    throw new Error(`업로드한 파일에 ${[...periods].join(', ')} 데이터가 함께 들어 있습니다. 한 파일에는 한 달 거래만 포함해 주세요.`);
  }
  const { error: deleteError } = await supabase.from('transactions').delete().eq('source_file', sourceFile);
  if (deleteError) fail(deleteError);
  for (let index = 0; index < parsed.length; index += 500) {
    const rows = parsed.slice(index, index + 500).map((row) => ({
      date: row.date,
      amount: row.amount,
      type: row.type,
      category: row.category,
      subcategory: row.subcategory,
      asset: row.asset,
      counter_asset: row.counterAsset,
      memo: row.memo,
      tag: row.tag,
      balance: row.balance,
      merchant: row.merchant,
      source_file: sourceFile,
      created_at: row.createdAt,
      updated_at: row.updatedAt
    }));
    const { error } = await supabase.from('transactions').insert(rows);
    if (error) fail(error);
  }
  const userId = await currentUserId();
  const dates = parsed.map((row) => row.date).sort();
  const now = new Date().toISOString();
  const { error: importError } = await supabase.from('import_files').upsert(
    {
      user_id: userId,
      source_file: sourceFile,
      transaction_count: parsed.length,
      first_date: dates[0] ?? '',
      last_date: dates.at(-1) ?? '',
      updated_at: now
    },
    { onConflict: 'user_id,source_file' }
  );
  if (importError) fail(importError);

  const existingAssets = await assetRows();
  const existingNames = new Set(existingAssets.map((asset) => asset.name));
  let order = Math.max(0, ...existingAssets.map((asset) => Number(asset.sort_order)));
  const assetNames = [...new Set(parsed.flatMap((row) => [row.asset, row.counterAsset]).filter(Boolean))].filter((name) => !existingNames.has(name));
  if (assetNames.length) {
    const { error } = await supabase.from('assets').insert(
      assetNames.map((name) => ({ name, kind: inferAssetKind(name), sort_order: (order += 10) }))
    );
    if (error) fail(error);
  }
  const categories = [...new Map(parsed.filter((row) => row.category).map((row) => [`${row.category}\u0000${row.subcategory}`, row])).values()];
  if (categories.length) {
    const { error } = await supabase.from('categories').upsert(
      categories.map((row) => ({ user_id: userId, name: row.category, parent_name: row.subcategory, type: row.type, updated_at: now })),
      { onConflict: 'user_id,name,parent_name', ignoreDuplicates: true }
    );
    if (error) fail(error);
  }
  const tagNames = [...new Set(parsed.flatMap((row) => row.tag.split(/[,\s#]+/).filter(Boolean)))];
  if (tagNames.length) {
    const { error } = await supabase.from('tags').upsert(
      tagNames.map((name) => ({ user_id: userId, name, updated_at: now })),
      { onConflict: 'user_id,name', ignoreDuplicates: true }
    );
    if (error) fail(error);
  }
  invalidateTransactions();
  return { count: parsed.length, sourceFile };
}

export const api = {
  dashboard,
  settings,
  updateSettings,
  manualNetWorth,
  addManualNetWorth: async (input: { period: string; amount: number }) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period)) throw new Error('년/월은 YYYY-MM 형식으로 입력해 주세요.');
    if (!Number.isFinite(input.amount)) throw new Error('순자산 금액을 숫자로 입력해 주세요.');
    const transactions = await allTransactions();
    const first = transactions.map((row) => row.date.slice(0, 7)).sort()[0];
    if (first && input.period >= first) throw new Error(`수동 순자산은 업로드된 첫 월(${first})보다 이전 월만 입력할 수 있습니다.`);
    const userId = await currentUserId();
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('manual_net_worth').upsert(
      { user_id: userId, period: input.period, amount: input.amount, updated_at: now },
      { onConflict: 'user_id,period' }
    ).select().single();
    if (error) fail(error);
    return { id: Number(data.id), period: data.period, amount: Number(data.amount), createdAt: data.created_at, updatedAt: data.updated_at };
  },
  deleteManualNetWorth: async (id: number) => {
    const { error } = await supabase.from('manual_net_worth').delete().eq('id', id);
    if (error) fail(error);
    return { ok: true as const };
  },
  metadata,
  updateAsset: async (
    id: number,
    input: { kind: AssetKind; initialValue: number; isHidden: boolean; isArchived: boolean; linkedAsset: string; sortOrder: number }
  ) => {
    const { error } = await supabase.from('assets').update({
      kind: input.kind,
      initial_value: input.initialValue,
      is_hidden: input.isHidden,
      is_archived: input.isArchived,
      linked_asset: input.linkedAsset,
      sort_order: input.sortOrder,
      updated_at: new Date().toISOString()
    }).eq('id', id);
    if (error) fail(error);
    return { ok: true as const };
  },
  periods: async () => [...new Set((await allTransactions()).map((row) => row.date.slice(0, 7)).filter(Boolean))].sort().reverse(),
  imports: async (): Promise<ImportFile[]> => {
    const { data, error } = await supabase.from('import_files').select('*').order('last_date', { ascending: false }).order('source_file');
    if (error) fail(error);
    return (data ?? []).map((row) => ({
      id: Number(row.id), sourceFile: row.source_file, storedPath: '', transactionCount: Number(row.transaction_count),
      firstDate: row.first_date, lastDate: row.last_date, uploadedAt: row.uploaded_at, updatedAt: row.updated_at
    }));
  },
  deleteImport: async (sourceFile: string) => {
    const tx = await supabase.from('transactions').delete().eq('source_file', sourceFile);
    if (tx.error) fail(tx.error);
    const imported = await supabase.from('import_files').delete().eq('source_file', sourceFile);
    if (imported.error) fail(imported.error);
    invalidateTransactions();
    return { ok: true as const };
  },
  replaceImport: (sourceFile: string, file: File) => importExcel(file, sourceFile),
  categoryExpense: async (period = '', type: 'income' | 'expense' = 'expense'): Promise<CategoryExpenseData> => {
    const transactions = await allTransactions();
    const periods = [...new Set(transactions.map((row) => row.date.slice(0, 7)).filter(Boolean))].sort().reverse();
    const selectedPeriod = period || periods[0] || '';
    const month = transactions.filter((row) => row.date.slice(0, 7) === selectedPeriod);
    const categoryTotals = new Map<string, { value: number; signedValue: number }>();
    for (const row of month.filter((item) => item.type === type)) {
      const current = categoryTotals.get(row.category) ?? { value: 0, signedValue: 0 };
      current.value += type === 'expense' ? -row.amount : Math.abs(row.amount);
      current.signedValue += type === 'expense' ? -row.amount : row.amount;
      categoryTotals.set(row.category, current);
    }
    return {
      selectedPeriod,
      type,
      summary: {
        income: month.filter((row) => row.type === 'income').reduce((sum, row) => sum + row.amount, 0),
        expense: month.filter((row) => row.type === 'expense').reduce((sum, row) => sum - row.amount, 0)
      },
      periods,
      rows: [...categoryTotals.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => Math.abs(b.signedValue) - Math.abs(a.signedValue))
    };
  },
  statistics: async () => {
    const transactions = await allTransactions();
    const sumBy = (key: (row: Transaction) => string, rows: Transaction[]) => {
      const map = new Map<string, number>();
      for (const row of rows) map.set(key(row), (map.get(key(row)) ?? 0) - row.amount);
      return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    };
    const expense = transactions.filter((row) => row.type === 'expense');
    return { accountSpend: sumBy((row) => row.asset, expense).slice(0, 20), topCategories: sumBy((row) => row.category, expense).slice(0, 10), topMerchants: sumBy((row) => row.merchant, expense.filter((row) => row.merchant)).slice(0, 10) };
  },
  transactions: async (query = '') => {
    const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
    let rows = [...(await allTransactions())];
    const q = params.get('q')?.toLowerCase();
    if (q) rows = rows.filter((row) => [row.memo, row.tag, row.category, row.merchant].some((value) => value.toLowerCase().includes(q)));
    const period = params.get('period');
    if (period) rows = rows.filter((row) => row.date.slice(0, 7) === period);
    for (const key of ['category', 'asset', 'sourceFile', 'type'] as const) {
      const value = params.get(key);
      if (value) rows = rows.filter((row) => row[key] === value);
    }
    const sortBy = (params.get('sortBy') || 'date') as 'date' | 'amount' | 'createdAt' | 'updatedAt';
    const direction = params.get('sortDir') === 'asc' ? 1 : -1;
    rows.sort((a, b) => direction * (typeof a[sortBy] === 'number' ? Number(a[sortBy]) - Number(b[sortBy]) : String(a[sortBy]).localeCompare(String(b[sortBy]))) || direction * (a.id - b.id));
    return rows.slice(0, Math.min(Number(params.get('limit') || 500), 2000));
  },
  uploadExcel: (file: File) => importExcel(file),
  importLegacyData: async (file: File) => {
    const payload = JSON.parse(await file.text()) as LegacyPayload;
    if (payload.version !== 1 || !Array.isArray(payload.transactions) || !Array.isArray(payload.assets)) {
      throw new Error('기존 EasyMoneyBook 내보내기 파일이 아닙니다.');
    }
    const userId = await currentUserId();
    for (const table of ['transactions', 'import_files', 'categories', 'assets', 'tags', 'settings', 'manual_net_worth']) {
      const { error } = await supabase.from(table).delete().eq('user_id', userId);
      if (error) fail(error);
    }

    const transactionRows = payload.transactions.map((row) => ({
      user_id: userId,
      date: String(row.date ?? ''),
      amount: Number(row.amount ?? 0),
      type: String(row.type ?? ''),
      category: String(row.category ?? ''),
      subcategory: String(row.subcategory ?? ''),
      asset: String(row.asset ?? ''),
      counter_asset: String(row.counterAsset ?? ''),
      memo: String(row.memo ?? ''),
      tag: String(row.tag ?? ''),
      balance: row.balance == null ? null : Number(row.balance),
      merchant: String(row.merchant ?? ''),
      source_file: String(row.sourceFile ?? ''),
      created_at: String(row.createdAt ?? new Date().toISOString()),
      updated_at: String(row.updatedAt ?? new Date().toISOString())
    }));
    for (let index = 0; index < transactionRows.length; index += 500) {
      const { error } = await supabase.from('transactions').insert(transactionRows.slice(index, index + 500));
      if (error) fail(error);
    }

    const assetData = payload.assets.map((row) => ({
      user_id: userId,
      name: String(row.name ?? ''),
      kind: String(row.kind || 'other'),
      initial_value: Number(row.initialValue ?? 0),
      is_hidden: Boolean(row.isHidden),
      is_archived: Boolean(row.isArchived),
      linked_asset: String(row.linkedAsset ?? ''),
      sort_order: Number(row.sortOrder ?? 0),
      created_at: String(row.createdAt ?? new Date().toISOString()),
      updated_at: String(row.updatedAt ?? new Date().toISOString())
    }));
    if (assetData.length) {
      const { error } = await supabase.from('assets').insert(assetData);
      if (error) fail(error);
    }
    const categoryData = payload.categories.map((row) => ({
      user_id: userId,
      name: String(row.name ?? ''),
      parent_name: String(row.parentName ?? ''),
      type: String(row.type || 'mixed'),
      created_at: String(row.createdAt ?? new Date().toISOString()),
      updated_at: String(row.updatedAt ?? new Date().toISOString())
    }));
    if (categoryData.length) {
      const { error } = await supabase.from('categories').insert(categoryData);
      if (error) fail(error);
    }
    const tagData = payload.tags.map((row) => ({
      user_id: userId,
      name: String(row.name ?? ''),
      created_at: String(row.createdAt ?? new Date().toISOString()),
      updated_at: String(row.updatedAt ?? new Date().toISOString())
    }));
    if (tagData.length) {
      const { error } = await supabase.from('tags').insert(tagData);
      if (error) fail(error);
    }
    const settingsData = payload.settings.map((row) => ({
      user_id: userId,
      key: String(row.key ?? ''),
      value: String(row.value ?? ''),
      updated_at: String(row.updatedAt ?? new Date().toISOString())
    }));
    if (settingsData.length) {
      const { error } = await supabase.from('settings').insert(settingsData);
      if (error) fail(error);
    }
    const manualData = payload.manualNetWorth.map((row) => ({
      user_id: userId,
      period: String(row.period ?? ''),
      amount: Number(row.amount ?? 0),
      created_at: String(row.createdAt ?? new Date().toISOString()),
      updated_at: String(row.updatedAt ?? new Date().toISOString())
    }));
    if (manualData.length) {
      const { error } = await supabase.from('manual_net_worth').insert(manualData);
      if (error) fail(error);
    }
    const importData = payload.importFiles.map((row) => ({
      user_id: userId,
      source_file: String(row.sourceFile ?? ''),
      transaction_count: Number(row.transactionCount ?? 0),
      first_date: String(row.firstDate ?? ''),
      last_date: String(row.lastDate ?? ''),
      uploaded_at: String(row.uploadedAt ?? new Date().toISOString()),
      updated_at: String(row.updatedAt ?? new Date().toISOString())
    }));
    if (importData.length) {
      const { error } = await supabase.from('import_files').insert(importData);
      if (error) fail(error);
    }
    invalidateTransactions();
    return { count: transactionRows.length };
  },
  signOut: () => supabase.auth.signOut()
};

import dayjs from 'dayjs';
import {
  AppSettings,
  AssetKind,
  CategoryExpenseData,
  DashboardData,
  ImportFile,
  ManualNetWorthPoint,
  Metadata,
  PensionSavingsData,
  Transaction
} from '../types/domain';
import { parseEasyMoneyBookFile } from '../lib/excelParser';
import { emptyLocalData, loadLocalData, LocalAssetRow, LocalData, nextId, saveLocalData } from '../lib/localStore';

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

type BackupEnvelope = {
  format: 'easy-moneybook-backup';
  formatVersion: 1;
  appVersion: string;
  exportedAt: string;
  data: LocalData;
};

type BackupSummary = {
  exportedAt: string;
  appVersion: string;
  transactionCount: number;
  assetCount: number;
  importFileCount: number;
};

const backupFormatVersion = 1;
const backupAppVersion = '0.2.7';
const backupArrayKeys = ['transactions', 'assets', 'categories', 'tags', 'settings', 'manual_net_worth', 'import_files'] as const;

const settingsDefaults: AppSettings = {
  appTitle: 'EasyMoneyBook Web',
  appSubtitle: '편한가계부 Excel 백업 분석 공간',
  chartGridXMonths: 12,
  chartGridYWon: 100_000_000,
  pensionChartGridXMonths: 12,
  pensionChartGridYWon: 10_000_000
};
const pensionAssetName = '삼성증권연금저축';

let dataCache: LocalData | null = null;

async function localData(): Promise<LocalData> {
  if (!dataCache) dataCache = await loadLocalData();
  return dataCache;
}

async function persist(data: LocalData): Promise<void> {
  const normalized = { ...data, pension_overrides: data.pension_overrides ?? [] };
  dataCache = normalized;
  await saveLocalData(normalized);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function readBackupFile(file: File): Promise<{ envelope: BackupEnvelope; summary: BackupSummary }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('백업 파일을 읽을 수 없습니다. EasyMoneyBook 전용 백업 파일인지 확인해 주세요.');
  }

  if (!isObject(parsed) || parsed.format !== 'easy-moneybook-backup' || parsed.formatVersion !== backupFormatVersion || !isObject(parsed.data)) {
    throw new Error('지원하지 않는 백업 파일입니다. EasyMoneyBook에서 만든 .embbackup 파일을 선택해 주세요.');
  }

  const rawData = parsed.data;
  if (rawData.version !== 1 || backupArrayKeys.some((key) => !Array.isArray(rawData[key]))) {
    throw new Error('백업 파일의 데이터 구조가 올바르지 않거나 손상되었습니다.');
  }

  const data = {
    ...(rawData as unknown as LocalData),
    pension_overrides: Array.isArray(rawData.pension_overrides) ? rawData.pension_overrides : []
  };
  const envelope: BackupEnvelope = {
    format: 'easy-moneybook-backup',
    formatVersion: 1,
    appVersion: typeof parsed.appVersion === 'string' ? parsed.appVersion : '알 수 없음',
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
    data
  };

  return {
    envelope,
    summary: {
      exportedAt: envelope.exportedAt,
      appVersion: envelope.appVersion,
      transactionCount: data.transactions.length,
      assetCount: data.assets.length,
      importFileCount: data.import_files.length
    }
  };
}

async function saveBackupBlob(blob: Blob, fileName: string): Promise<void> {
  type WritableFile = { write: (data: Blob) => Promise<void>; close: () => Promise<void> };
  type FileHandle = { createWritable: () => Promise<WritableFile> };
  type PickerWindow = Window & {
    showSaveFilePicker?: (options: {
      suggestedName: string;
      types: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<FileHandle>;
  };

  const pickerWindow = window as PickerWindow;
  if (pickerWindow.showSaveFilePicker) {
    const handle = await pickerWindow.showSaveFilePicker({
      suggestedName: fileName,
      types: [{ description: 'EasyMoneyBook 백업', accept: { 'application/json': ['.embbackup'] } }]
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function pensionMonthlyRows(transactions: Transaction[], data: LocalData): PensionSavingsData['rows'] {
  const automatic = new Map<string, { principal: number; profit: number }>();
  for (const row of transactions.filter((item) => item.asset === pensionAssetName)) {
    const period = row.date.slice(0, 7);
    const current = automatic.get(period) ?? { principal: 0, profit: 0 };
    if (row.type === 'transfer') current.principal += row.amount;
    else current.profit += row.amount;
    automatic.set(period, current);
  }
  const overrides = new Map((data.pension_overrides ?? []).map((row) => [row.period, row]));
  const pensionPeriods = [...new Set([...automatic.keys(), ...overrides.keys()])].sort();
  const latestTransactionPeriod = transactions.map((row) => row.date.slice(0, 7)).filter(Boolean).sort().at(-1);
  const firstPeriod = pensionPeriods[0];
  const lastPeriod = [pensionPeriods.at(-1), latestTransactionPeriod].filter(Boolean).sort().at(-1);
  const periods: string[] = [];
  if (firstPeriod && lastPeriod) {
    let cursor = dayjs(`${firstPeriod}-01`);
    const end = dayjs(`${lastPeriod}-01`);
    while (!cursor.isAfter(end)) {
      periods.push(cursor.format('YYYY-MM'));
      cursor = cursor.add(1, 'month');
    }
  }
  return periods.map((period) => {
    const auto = automatic.get(period) ?? { principal: 0, profit: 0 };
    const manual = overrides.get(period);
    return {
      period,
      principal: manual?.principal ?? auto.principal,
      profit: manual?.profit ?? auto.profit,
      autoPrincipal: auto.principal,
      autoProfit: auto.profit,
      isManual: Boolean(manual)
    };
  });
}

async function pensionSavings(): Promise<PensionSavingsData> {
  const [transactions, assets, data] = await Promise.all([allTransactions(), assetRows(), localData()]);
  return {
    assetName: pensionAssetName,
    initialValue: assets.find((asset) => asset.name === pensionAssetName)?.initial_value ?? 0,
    rows: pensionMonthlyRows(transactions, data).reverse()
  };
}

function mapTransaction(row: LocalData['transactions'][number]): Transaction {
  return {
    id: Number(row.id),
    date: row.date,
    amount: Number(row.amount),
    type: row.type,
    category: row.category,
    subcategory: row.subcategory,
    asset: row.asset,
    counterAsset: row.counter_asset,
    memo: row.memo,
    tag: row.tag,
    balance: row.balance == null ? null : Number(row.balance),
    merchant: row.merchant,
    sourceFile: row.source_file,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function allTransactions(): Promise<Transaction[]> {
  return (await localData()).transactions.map(mapTransaction);
}

async function assetRows(): Promise<LocalAssetRow[]> {
  return [...(await localData()).assets].sort(
    (a, b) => Number(a.is_archived) - Number(b.is_archived) || Number(a.is_hidden) - Number(b.is_hidden) || a.sort_order - b.sort_order || a.name.localeCompare(b.name)
  );
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

async function manualNetWorth(): Promise<ManualNetWorthPoint[]> {
  return [...(await localData()).manual_net_worth]
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((row) => ({ id: row.id, period: row.period, amount: row.amount, createdAt: row.created_at, updatedAt: row.updated_at }));
}

async function dashboard(): Promise<DashboardData> {
  const [transactions, assets, manual, data] = await Promise.all([allTransactions(), assetRows(), manualNetWorth(), localData()]);
  const months = [...new Set(transactions.map((row) => row.date.slice(0, 7)).filter(Boolean))].sort();
  const latestPeriod = months.at(-1) ?? '';
  const latestRows = transactions.filter((row) => row.date.slice(0, 7) === latestPeriod);
  const monthIncome = latestRows.filter((row) => row.type === 'income').reduce((sum, row) => sum + row.amount, 0);
  const monthExpense = latestRows.filter((row) => row.type === 'expense').reduce((sum, row) => sum - row.amount, 0);
  const includedAssets = assets.filter((asset) => !asset.is_hidden);
  const liabilityKinds = new Set<AssetKind>(['card', 'loan']);
  const values = includedAssets.map((asset) => ({
    kind: asset.kind,
    value: asset.initial_value + transactions.filter((row) => row.asset === asset.name && (!latestPeriod || row.date.slice(0, 7) <= latestPeriod)).reduce((sum, row) => sum + row.amount, 0)
  }));
  const totalAssets = values.filter((row) => !liabilityKinds.has(row.kind)).reduce((sum, row) => sum + Math.max(0, row.value), 0);
  const liabilities = values.filter((row) => liabilityKinds.has(row.kind)).reduce((sum, row) => sum + Math.abs(row.value), 0);
  const netWorth = values.filter((row) => !liabilityKinds.has(row.kind)).reduce((sum, row) => sum + row.value, 0) - liabilities;

  const visibleNames = new Set(includedAssets.map((asset) => asset.name));
  const initialNetWorth = includedAssets.reduce(
    (sum, asset) => sum + (liabilityKinds.has(asset.kind) ? -Math.abs(asset.initial_value) : asset.initial_value),
    0
  );
  let runningNetWorth = initialNetWorth;
  const calculatedLine = months.map((month) => {
    runningNetWorth += transactions.filter((row) => row.date.slice(0, 7) === month && visibleNames.has(row.asset)).reduce((sum, row) => sum + row.amount, 0);
    return { month, netWorth: runningNetWorth, isManual: 0 };
  });
  const assetLine = [...manual.map((row) => ({ month: row.period, netWorth: row.amount, isManual: 1 })), ...calculatedLine].sort((a, b) => a.month.localeCompare(b.month));
  const debtRatioLine = months.map((month) => {
    const monthValues = includedAssets.map((asset) => ({
      kind: asset.kind,
      value: asset.initial_value + transactions.filter((row) => row.asset === asset.name && row.date.slice(0, 7) <= month).reduce((sum, row) => sum + row.amount, 0)
    }));
    const monthAssets = monthValues.filter((row) => !liabilityKinds.has(row.kind)).reduce((sum, row) => sum + Math.max(row.value, 0), 0);
    const monthLiabilities = monthValues.filter((row) => liabilityKinds.has(row.kind)).reduce((sum, row) => sum + Math.abs(row.value), 0);
    return { month, debtRatio: monthAssets ? (monthLiabilities * 100) / monthAssets : 0 };
  });

  const pensionAsset = assets.find((asset) => asset.name === pensionAssetName);
  const pensionMonths = pensionMonthlyRows(transactions, data);
  const pensionByMonth = new Map(pensionMonths.map((row) => [row.period, row]));
  const firstPensionMonth = pensionMonths[0]?.period;
  let pensionPrincipal = pensionAsset?.initial_value ?? 0;
  let pensionProfit = 0;
  const pensionChartMonths = [...new Set([...months, ...pensionMonths.map((row) => row.period)])].sort();
  const pensionLine = pensionChartMonths
    .filter((month) => firstPensionMonth && month >= firstPensionMonth)
    .map((month) => {
      const monthRow = pensionByMonth.get(month);
      pensionPrincipal += monthRow?.principal ?? 0;
      pensionProfit += monthRow?.profit ?? 0;
      return { month, principal: pensionPrincipal, profit: pensionProfit, total: pensionPrincipal + pensionProfit };
    });

  const categoryTotals = new Map<string, number>();
  for (const row of latestRows.filter((item) => item.type === 'expense')) categoryTotals.set(row.category, (categoryTotals.get(row.category) ?? 0) - row.amount);
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
    debtRatioLineYearly: yearlyRows(debtRatioLine),
    pensionLine
  };
}

async function settings(): Promise<AppSettings> {
  const values = Object.fromEntries((await localData()).settings.map((row) => [row.key, row.value]));
  return {
    appTitle: values.appTitle || settingsDefaults.appTitle,
    appSubtitle: values.appSubtitle || settingsDefaults.appSubtitle,
    chartGridXMonths: Math.max(1, Number(values.chartGridXMonths || settingsDefaults.chartGridXMonths)),
    chartGridYWon: Math.max(100_000_000, Number(values.chartGridYWon || settingsDefaults.chartGridYWon)),
    pensionChartGridXMonths: Math.max(1, Number(values.pensionChartGridXMonths || settingsDefaults.pensionChartGridXMonths)),
    pensionChartGridYWon: Math.max(10_000, Number(values.pensionChartGridYWon || settingsDefaults.pensionChartGridYWon))
  };
}

async function updateSettings(input: AppSettings): Promise<AppSettings> {
  const data = await localData();
  const next = {
    appTitle: input.appTitle.trim() || settingsDefaults.appTitle,
    appSubtitle: input.appSubtitle.trim() || settingsDefaults.appSubtitle,
    chartGridXMonths: Math.max(1, Math.round(Number(input.chartGridXMonths || 12))),
    chartGridYWon: Math.max(100_000_000, Math.round(Number(input.chartGridYWon || 100_000_000) / 100_000_000) * 100_000_000),
    pensionChartGridXMonths: Math.max(1, Math.round(Number(input.pensionChartGridXMonths || 12))),
    pensionChartGridYWon: Math.max(10_000, Math.round(Number(input.pensionChartGridYWon || 10_000_000) / 10_000) * 10_000)
  };
  const now = new Date().toISOString();
  for (const [key, value] of Object.entries(next)) {
    const row = data.settings.find((item) => item.key === key);
    if (row) Object.assign(row, { value: String(value), updated_at: now });
    else data.settings.push({ key, value: String(value), updated_at: now });
  }
  await persist(data);
  return next;
}

async function metadata(): Promise<Metadata> {
  const [assets, transactions] = await Promise.all([assetRows(), allTransactions()]);
  const data = await localData();
  const latest = transactions.map((row) => row.date.slice(0, 7)).sort().at(-1) ?? '';
  const ownValues = new Map<string, number>();
  for (const row of transactions) if (!latest || row.date.slice(0, 7) <= latest) ownValues.set(row.asset, (ownValues.get(row.asset) ?? 0) + row.amount);
  const linkedValues = new Map<string, number>();
  for (const asset of assets.filter((row) => row.kind === 'checkCard' && row.linked_asset)) linkedValues.set(asset.linked_asset, (linkedValues.get(asset.linked_asset) ?? 0) + (ownValues.get(asset.name) ?? 0));
  return {
    assets: assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      kind: asset.kind,
      initialValue: asset.initial_value,
      currentValue: asset.kind === 'checkCard' ? asset.initial_value : asset.initial_value + (ownValues.get(asset.name) ?? 0) + (linkedValues.get(asset.name) ?? 0),
      isHidden: asset.is_hidden ? 1 : 0,
      isArchived: asset.is_archived ? 1 : 0,
      linkedAsset: asset.linked_asset,
      sortOrder: asset.sort_order
    })),
    categories: data.categories.map((row) => ({ id: row.id, name: row.name, parentName: row.parent_name, type: row.type })),
    tags: data.tags.map((row) => ({ id: row.id, name: row.name }))
  };
}

async function importExcel(file: File, sourceFile = file.name) {
  const parsed = (await parseEasyMoneyBookFile(file)).map((row) => ({ ...row, sourceFile }));
  const periods = new Set(parsed.map((row) => row.date.slice(0, 7)).filter(Boolean));
  if (periods.size > 1) throw new Error(`업로드한 파일에 ${[...periods].join(', ')} 데이터가 함께 들어 있습니다. 한 파일에는 한 달 거래만 포함해 주세요.`);
  const data = await localData();
  data.transactions = data.transactions.filter((row) => row.source_file !== sourceFile);
  let transactionId = nextId(data.transactions);
  data.transactions.push(...parsed.map((row) => ({
    id: transactionId++, date: row.date, amount: row.amount, type: row.type, category: row.category, subcategory: row.subcategory,
    asset: row.asset, counter_asset: row.counterAsset, memo: row.memo, tag: row.tag, balance: row.balance,
    merchant: row.merchant, source_file: sourceFile, created_at: row.createdAt, updated_at: row.updatedAt
  })));
  const dates = parsed.map((row) => row.date).sort();
  const now = new Date().toISOString();
  const importRow = data.import_files.find((row) => row.source_file === sourceFile);
  const importValue = { source_file: sourceFile, transaction_count: parsed.length, first_date: dates[0] ?? '', last_date: dates.at(-1) ?? '', updated_at: now };
  if (importRow) Object.assign(importRow, importValue);
  else data.import_files.push({ id: nextId(data.import_files), ...importValue, uploaded_at: now });

  let order = Math.max(0, ...data.assets.map((asset) => asset.sort_order));
  let assetId = nextId(data.assets);
  const existingAssets = new Set(data.assets.map((asset) => asset.name));
  for (const name of [...new Set(parsed.flatMap((row) => [row.asset, row.counterAsset]).filter(Boolean))]) {
    if (existingAssets.has(name)) continue;
    data.assets.push({ id: assetId++, name, kind: inferAssetKind(name), initial_value: 0, is_hidden: /자산\s*미반영/.test(name), is_archived: false, linked_asset: '', sort_order: (order += 10), created_at: now, updated_at: now });
  }
  let categoryId = nextId(data.categories);
  const categoryKeys = new Set(data.categories.map((row) => `${row.name}\u0000${row.parent_name}`));
  for (const row of parsed.filter((item) => item.category)) {
    const key = `${row.category}\u0000${row.subcategory}`;
    if (categoryKeys.has(key)) continue;
    categoryKeys.add(key);
    data.categories.push({ id: categoryId++, name: row.category, parent_name: row.subcategory, type: row.type, created_at: now, updated_at: now });
  }
  let tagId = nextId(data.tags);
  const existingTags = new Set(data.tags.map((row) => row.name));
  for (const name of [...new Set(parsed.flatMap((row) => row.tag.split(/[,\s#]+/).filter(Boolean)))]) {
    if (existingTags.has(name)) continue;
    data.tags.push({ id: tagId++, name, created_at: now, updated_at: now });
  }
  await persist(data);
  return { count: parsed.length, sourceFile };
}

function legacyToLocal(payload: LegacyPayload): LocalData {
  const now = new Date().toISOString();
  return {
    version: 1,
    transactions: payload.transactions.map((row, index) => ({
      id: Number(row.id ?? index + 1), date: String(row.date ?? ''), amount: Number(row.amount ?? 0), type: row.type as Transaction['type'],
      category: String(row.category ?? ''), subcategory: String(row.subcategory ?? ''), asset: String(row.asset ?? ''), counter_asset: String(row.counterAsset ?? ''),
      memo: String(row.memo ?? ''), tag: String(row.tag ?? ''), balance: row.balance == null ? null : Number(row.balance), merchant: String(row.merchant ?? ''),
      source_file: String(row.sourceFile ?? ''), created_at: String(row.createdAt ?? now), updated_at: String(row.updatedAt ?? now)
    })),
    assets: payload.assets.map((row, index) => ({
      id: Number(row.id ?? index + 1), name: String(row.name ?? ''), kind: (row.kind || 'other') as AssetKind, initial_value: Number(row.initialValue ?? 0),
      is_hidden: Boolean(row.isHidden), is_archived: Boolean(row.isArchived), linked_asset: String(row.linkedAsset ?? ''), sort_order: Number(row.sortOrder ?? 0),
      created_at: String(row.createdAt ?? now), updated_at: String(row.updatedAt ?? now)
    })),
    categories: payload.categories.map((row, index) => ({ id: Number(row.id ?? index + 1), name: String(row.name ?? ''), parent_name: String(row.parentName ?? ''), type: String(row.type || 'mixed'), created_at: String(row.createdAt ?? now), updated_at: String(row.updatedAt ?? now) })),
    tags: payload.tags.map((row, index) => ({ id: Number(row.id ?? index + 1), name: String(row.name ?? ''), created_at: String(row.createdAt ?? now), updated_at: String(row.updatedAt ?? now) })),
    settings: payload.settings.map((row) => ({ key: String(row.key ?? ''), value: String(row.value ?? ''), updated_at: String(row.updatedAt ?? now) })),
    manual_net_worth: payload.manualNetWorth.map((row, index) => ({ id: Number(row.id ?? index + 1), period: String(row.period ?? ''), amount: Number(row.amount ?? 0), created_at: String(row.createdAt ?? now), updated_at: String(row.updatedAt ?? now) })),
    pension_overrides: [],
    import_files: payload.importFiles.map((row, index) => ({ id: Number(row.id ?? index + 1), source_file: String(row.sourceFile ?? ''), transaction_count: Number(row.transactionCount ?? 0), first_date: String(row.firstDate ?? ''), last_date: String(row.lastDate ?? ''), uploaded_at: String(row.uploadedAt ?? now), updated_at: String(row.updatedAt ?? now) }))
  };
}

export const api = {
  dashboard,
  pensionSavings,
  updatePensionMonth: async (input: { period: string; principal: number; profit: number }) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period)) throw new Error('년/월은 YYYY-MM 형식으로 입력해 주세요.');
    if (!Number.isFinite(input.principal) || !Number.isFinite(input.profit)) throw new Error('원금과 수익을 숫자로 입력해 주세요.');
    const data = await localData();
    const now = new Date().toISOString();
    const row = (data.pension_overrides ?? []).find((item) => item.period === input.period);
    if (row) Object.assign(row, { principal: input.principal, profit: input.profit, updated_at: now });
    else data.pension_overrides.push({ period: input.period, principal: input.principal, profit: input.profit, updated_at: now });
    await persist(data);
    return { ok: true as const };
  },
  deletePensionMonth: async (period: string) => {
    const data = await localData();
    data.pension_overrides = (data.pension_overrides ?? []).filter((row) => row.period !== period);
    await persist(data);
    return { ok: true as const };
  },
  settings,
  updateSettings,
  manualNetWorth,
  addManualNetWorth: async (input: { period: string; amount: number }) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period)) throw new Error('년/월은 YYYY-MM 형식으로 입력해 주세요.');
    if (!Number.isFinite(input.amount)) throw new Error('순자산 금액을 숫자로 입력해 주세요.');
    const data = await localData();
    const first = data.transactions.map((row) => row.date.slice(0, 7)).sort()[0];
    if (first && input.period >= first) throw new Error(`수동 순자산은 업로드된 첫 월(${first})보다 이전 월만 입력할 수 있습니다.`);
    const now = new Date().toISOString();
    let row = data.manual_net_worth.find((item) => item.period === input.period);
    if (row) Object.assign(row, { amount: input.amount, updated_at: now });
    else {
      row = { id: nextId(data.manual_net_worth), period: input.period, amount: input.amount, created_at: now, updated_at: now };
      data.manual_net_worth.push(row);
    }
    await persist(data);
    return { id: row.id, period: row.period, amount: row.amount, createdAt: row.created_at, updatedAt: row.updated_at };
  },
  deleteManualNetWorth: async (id: number) => {
    const data = await localData();
    data.manual_net_worth = data.manual_net_worth.filter((row) => row.id !== id);
    await persist(data);
    return { ok: true as const };
  },
  metadata,
  updateAsset: async (id: number, input: { kind: AssetKind; initialValue: number; isHidden: boolean; isArchived: boolean; linkedAsset: string; sortOrder: number }) => {
    const data = await localData();
    const row = data.assets.find((asset) => asset.id === id);
    if (!row) throw new Error('자산을 찾지 못했습니다.');
    Object.assign(row, { kind: input.kind, initial_value: input.initialValue, is_hidden: input.isHidden, is_archived: input.isArchived, linked_asset: input.linkedAsset, sort_order: input.sortOrder, updated_at: new Date().toISOString() });
    await persist(data);
    return { ok: true as const };
  },
  periods: async () => [...new Set((await allTransactions()).map((row) => row.date.slice(0, 7)).filter(Boolean))].sort().reverse(),
  imports: async (): Promise<ImportFile[]> => [...(await localData()).import_files].sort((a, b) => b.last_date.localeCompare(a.last_date) || a.source_file.localeCompare(b.source_file)).map((row) => ({ id: row.id, sourceFile: row.source_file, storedPath: '', transactionCount: row.transaction_count, firstDate: row.first_date, lastDate: row.last_date, uploadedAt: row.uploaded_at, updatedAt: row.updated_at })),
  deleteImport: async (sourceFile: string) => {
    const data = await localData();
    data.transactions = data.transactions.filter((row) => row.source_file !== sourceFile);
    data.import_files = data.import_files.filter((row) => row.source_file !== sourceFile);
    await persist(data);
    return { ok: true as const };
  },
  replaceImport: (sourceFile: string, file: File) => importExcel(file, sourceFile),
  categoryExpense: async (period = '', type: 'income' | 'expense' = 'expense'): Promise<CategoryExpenseData> => {
    const transactions = await allTransactions();
    const periods = [...new Set(transactions.map((row) => row.date.slice(0, 7)).filter(Boolean))].sort().reverse();
    const selectedPeriod = period || periods[0] || '';
    const month = transactions.filter((row) => row.date.slice(0, 7) === selectedPeriod);
    const totals = new Map<string, { value: number; signedValue: number }>();
    for (const row of month.filter((item) => item.type === type)) {
      const current = totals.get(row.category) ?? { value: 0, signedValue: 0 };
      current.value += type === 'expense' ? -row.amount : Math.abs(row.amount);
      current.signedValue += type === 'expense' ? -row.amount : row.amount;
      totals.set(row.category, current);
    }
    return { selectedPeriod, type, summary: { income: month.filter((row) => row.type === 'income').reduce((sum, row) => sum + row.amount, 0), expense: month.filter((row) => row.type === 'expense').reduce((sum, row) => sum - row.amount, 0) }, periods, rows: [...totals.entries()].map(([name, value]) => ({ name, ...value })).sort((a, b) => Math.abs(b.signedValue) - Math.abs(a.signedValue)) };
  },
  statistics: async () => {
    const transactions = await allTransactions();
    const expense = transactions.filter((row) => row.type === 'expense');
    const sumBy = (key: (row: Transaction) => string, rows: Transaction[]) => {
      const map = new Map<string, number>();
      for (const row of rows) map.set(key(row), (map.get(key(row)) ?? 0) - row.amount);
      return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    };
    return { accountSpend: sumBy((row) => row.asset, expense).slice(0, 20), topCategories: sumBy((row) => row.category, expense).slice(0, 10), topMerchants: sumBy((row) => row.merchant, expense.filter((row) => row.merchant)).slice(0, 10) };
  },
  transactions: async (query = '') => {
    const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
    let rows = [...(await allTransactions())];
    const q = params.get('q')?.toLowerCase();
    if (q) rows = rows.filter((row) => [row.memo, row.tag, row.category, row.merchant].some((value) => value.toLowerCase().includes(q)));
    const period = params.get('period');
    if (period) rows = rows.filter((row) => row.date.slice(0, 7) === period);
    const from = params.get('from');
    const to = params.get('to');
    if (from) rows = rows.filter((row) => row.date >= from);
    if (to) rows = rows.filter((row) => row.date <= to);
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
    const parsed = JSON.parse(await file.text()) as LegacyPayload | { format: string; data: LocalData };
    const data = 'format' in parsed && parsed.format === 'easy-moneybook-browser' ? parsed.data : legacyToLocal(parsed as LegacyPayload);
    if (data.version !== 1 || !Array.isArray(data.transactions) || !Array.isArray(data.assets)) throw new Error('기존 EasyMoneyBook 내보내기 파일이 아닙니다.');
    await persist(data);
    return { count: data.transactions.length };
  },
  exportBackup: async () => {
    const data = await localData();
    const exportedAt = new Date().toISOString();
    const envelope: BackupEnvelope = {
      format: 'easy-moneybook-backup',
      formatVersion: 1,
      appVersion: backupAppVersion,
      exportedAt,
      data
    };
    const blob = new Blob([JSON.stringify(envelope)], { type: 'application/json' });
    const fileName = `easy-moneybook-${exportedAt.slice(0, 10)}.embbackup`;
    await saveBackupBlob(blob, fileName);
    return { fileName, transactionCount: data.transactions.length };
  },
  inspectBackup: async (file: File) => (await readBackupFile(file)).summary,
  restoreBackup: async (file: File) => {
    const { envelope, summary } = await readBackupFile(file);
    await persist(envelope.data);
    return summary;
  },
  clearLocalData: async () => {
    await persist(emptyLocalData());
    return { ok: true as const };
  }
};

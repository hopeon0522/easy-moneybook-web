export type LocalTransactionRow = {
  id: number;
  date: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  category: string;
  subcategory: string;
  asset: string;
  counter_asset: string;
  memo: string;
  tag: string;
  balance: number | null;
  merchant: string;
  source_file: string;
  created_at: string;
  updated_at: string;
};

export type LocalAssetRow = {
  id: number;
  name: string;
  kind: 'savings' | 'investment' | 'card' | 'checkCard' | 'loan' | 'other';
  initial_value: number;
  is_hidden: boolean;
  is_archived: boolean;
  linked_asset: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type LocalData = {
  version: 1;
  transactions: LocalTransactionRow[];
  assets: LocalAssetRow[];
  categories: Array<{ id: number; name: string; parent_name: string; type: string; created_at: string; updated_at: string }>;
  tags: Array<{ id: number; name: string; created_at: string; updated_at: string }>;
  settings: Array<{ key: string; value: string; updated_at: string }>;
  manual_net_worth: Array<{ id: number; period: string; amount: number; created_at: string; updated_at: string }>;
  pension_overrides: Array<{ period: string; principal: number; profit: number; updated_at: string }>;
  import_files: Array<{
    id: number;
    source_file: string;
    transaction_count: number;
    first_date: string;
    last_date: string;
    uploaded_at: string;
    updated_at: string;
  }>;
};

const databaseName = 'easy-moneybook-local';
const storeName = 'state';
const dataKey = 'primary';

export function emptyLocalData(): LocalData {
  return {
    version: 1,
    transactions: [],
    assets: [],
    categories: [],
    tags: [],
    settings: [],
    manual_net_worth: [],
    pension_overrides: [],
    import_files: []
  };
}

function normalizeLocalData(data?: LocalData): LocalData {
  if (!data) return emptyLocalData();
  return {
    ...emptyLocalData(),
    ...data,
    pension_overrides: Array.isArray(data.pension_overrides) ? data.pension_overrides : []
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('로컬 데이터베이스를 열지 못했습니다.'));
  });
}

export async function loadLocalData(): Promise<LocalData> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).get(dataKey);
    request.onsuccess = () => resolve(normalizeLocalData(request.result as LocalData | undefined));
    request.onerror = () => reject(request.error ?? new Error('로컬 데이터를 읽지 못했습니다.'));
    transaction.oncomplete = () => database.close();
  });
}

export async function saveLocalData(data: LocalData): Promise<void> {
  const normalized = normalizeLocalData(data);
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(normalized, dataKey);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('로컬 데이터를 저장하지 못했습니다.'));
    };
  });
}

export function nextId(rows: Array<{ id: number }>): number {
  return rows.reduce((maximum, row) => Math.max(maximum, Number(row.id) || 0), 0) + 1;
}

export type TransactionType = 'income' | 'expense' | 'transfer';

export interface Transaction {
  id: number;
  date: string;
  amount: number;
  type: TransactionType;
  category: string;
  subcategory: string;
  asset: string;
  counterAsset: string;
  memo: string;
  tag: string;
  balance: number | null;
  merchant: string;
  sourceFile: string;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardData {
  summary: {
    latestPeriod: string;
    monthIncome: number;
    monthExpense: number;
    monthNet: number;
    totalAssets: number;
    liabilities: number;
    netWorth: number;
  };
  recent: Transaction[];
  categoryPie: Array<{ name: string; value: number }>;
  monthlyBars: Array<{ month: string; income: number; expense: number }>;
  assetLine: Array<{ month: string; netWorth: number; isManual?: number }>;
  assetLineYearly: Array<{ year: string; month?: string; netWorth: number; isManual?: number }>;
  debtRatioLine: Array<{ month: string; debtRatio: number }>;
  debtRatioLineYearly: Array<{ year: string; month?: string; debtRatio: number }>;
  pensionLine: Array<{ month: string; principal: number; profit: number; total: number }>;
}

export interface Metadata {
  assets: Array<{
    id: number;
    name: string;
    kind: AssetKind;
    initialValue: number;
    currentValue: number;
    isHidden: number;
    isArchived: number;
    linkedAsset: string;
    sortOrder: number;
  }>;
  categories: Array<{ id: number; name: string; parentName: string; type: string }>;
  tags: Array<{ id: number; name: string }>;
}

export type AssetKind = 'savings' | 'investment' | 'card' | 'checkCard' | 'loan' | 'other';

export interface ImportFile {
  id: number;
  sourceFile: string;
  storedPath: string;
  transactionCount: number;
  firstDate: string;
  lastDate: string;
  uploadedAt: string;
  updatedAt: string;
}

export interface CategoryExpenseData {
  selectedPeriod: string;
  type: 'income' | 'expense';
  summary: {
    income: number;
    expense: number;
  };
  periods: string[];
  rows: Array<{ name: string; value: number; signedValue: number }>;
}

export interface AppSettings {
  appTitle: string;
  appSubtitle: string;
  chartGridXMonths: number;
  chartGridYWon: number;
  pensionChartGridXMonths: number;
  pensionChartGridYWon: number;
}

export interface ManualNetWorthPoint {
  id: number;
  period: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PensionSavingsData {
  assetName: string;
  initialValue: number;
  rows: Array<{
    period: string;
    principal: number;
    profit: number;
    autoPrincipal: number;
    autoProfit: number;
    isManual: boolean;
  }>;
}

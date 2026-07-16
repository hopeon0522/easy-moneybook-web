export type TransactionType = 'income' | 'expense' | 'transfer';

export interface Transaction {
  id?: number;
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
  createdAt?: string;
  updatedAt?: string;
}

export interface Asset {
  id?: number;
  name: string;
  kind: string;
  initialValue: number;
  currentValue?: number;
  isHidden: boolean;
  isArchived: boolean;
  linkedAsset: string;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Category {
  id?: number;
  name: string;
  parentName: string;
  type: TransactionType | 'mixed';
  createdAt?: string;
  updatedAt?: string;
}

export interface Tag {
  id?: number;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DashboardSummary {
  monthIncome: number;
  monthExpense: number;
  monthNet: number;
  totalAssets: number;
  cardSpend: number;
  cashHolding: number;
}

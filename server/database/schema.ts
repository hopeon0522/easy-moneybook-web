export const schemaSql = `
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  type TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  subcategory TEXT NOT NULL DEFAULT '',
  asset TEXT NOT NULL DEFAULT '',
  counterAsset TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  tag TEXT NOT NULL DEFAULT '',
  balance REAL,
  merchant TEXT NOT NULL DEFAULT '',
  sourceFile TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sourceFile TEXT NOT NULL UNIQUE,
  storedPath TEXT NOT NULL DEFAULT '',
  transactionCount INTEGER NOT NULL DEFAULT 0,
  firstDate TEXT NOT NULL DEFAULT '',
  lastDate TEXT NOT NULL DEFAULT '',
  uploadedAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  parentName TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'mixed',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(name, parentName)
);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'account',
  initialValue REAL NOT NULL DEFAULT 0,
  isHidden INTEGER NOT NULL DEFAULT 0,
  isArchived INTEGER NOT NULL DEFAULT 0,
  linkedAsset TEXT NOT NULL DEFAULT '',
  sortOrder INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS manual_net_worth (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT NOT NULL UNIQUE,
  amount REAL NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_asset ON transactions(asset);
CREATE INDEX IF NOT EXISTS idx_transactions_tag ON transactions(tag);
CREATE INDEX IF NOT EXISTS idx_transactions_amount ON transactions(amount);
CREATE INDEX IF NOT EXISTS idx_transactions_memo ON transactions(memo);
CREATE INDEX IF NOT EXISTS idx_transactions_source_file ON transactions(sourceFile);
CREATE INDEX IF NOT EXISTS idx_import_files_uploaded_at ON import_files(uploadedAt);
CREATE INDEX IF NOT EXISTS idx_manual_net_worth_period ON manual_net_worth(period);
`;

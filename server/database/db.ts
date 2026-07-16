import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { schemaSql } from './schema';

const dataDir = resolve(process.cwd(), 'data');
const dbPath = resolve(dataDir, 'easy-moneybook.sqlite3');

mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

export function initDatabase(): void {
  db.exec(schemaSql);
  migrateDatabase();
}

function migrateDatabase(): void {
  const columns = db.prepare('PRAGMA table_info(assets)').all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'initialValue')) {
    db.exec('ALTER TABLE assets ADD COLUMN initialValue REAL NOT NULL DEFAULT 0');
  }
  if (!columns.some((column) => column.name === 'isArchived')) {
    db.exec('ALTER TABLE assets ADD COLUMN isArchived INTEGER NOT NULL DEFAULT 0');
  }
  if (!columns.some((column) => column.name === 'linkedAsset')) {
    db.exec("ALTER TABLE assets ADD COLUMN linkedAsset TEXT NOT NULL DEFAULT ''");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS manual_net_worth (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period TEXT NOT NULL UNIQUE,
      amount REAL NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_manual_net_worth_period ON manual_net_worth(period);
  `);
}

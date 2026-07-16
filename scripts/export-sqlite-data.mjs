import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const source = resolve(process.argv[2] || 'data/easy-moneybook.sqlite3');
const output = resolve(process.argv[3] || 'private-export/easy-moneybook-data.json');
const db = new DatabaseSync(source, { readOnly: true });

const all = (table) => db.prepare(`SELECT * FROM ${table}`).all();
const payload = {
  version: 1,
  exportedAt: new Date().toISOString(),
  transactions: all('transactions'),
  assets: all('assets'),
  categories: all('categories'),
  tags: all('tags'),
  settings: all('settings'),
  manualNetWorth: all('manual_net_worth'),
  importFiles: all('import_files')
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(payload));
console.log(`Exported ${payload.transactions.length} transactions to ${output}`);

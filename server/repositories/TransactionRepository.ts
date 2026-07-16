import { db } from '../database/db';
import { Transaction } from '../types/domain';

export interface TransactionFilters {
  q?: string;
  from?: string;
  to?: string;
  category?: string;
  asset?: string;
  tag?: string;
  period?: string;
  sourceFile?: string;
  type?: 'income' | 'expense' | 'transfer';
  minAmount?: number;
  maxAmount?: number;
  sortBy?: 'date' | 'amount' | 'createdAt' | 'updatedAt';
  sortDir?: 'asc' | 'desc';
  limit?: number;
}

const allowedSort = new Set(['date', 'amount', 'createdAt', 'updatedAt']);

export class TransactionRepository {
  replaceSourceFile(sourceFile: string, transactions: Transaction[]): void {
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM transactions WHERE sourceFile = ?').run(sourceFile);
      const insert = db.prepare(`
        INSERT INTO transactions (
          date, amount, type, category, subcategory, asset, counterAsset, memo, tag,
          balance, merchant, sourceFile, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const tx of transactions) {
        const now = new Date().toISOString();
        insert.run(
          tx.date,
          tx.amount,
          tx.type,
          tx.category,
          tx.subcategory,
          tx.asset,
          tx.counterAsset,
          tx.memo,
          tx.tag,
          tx.balance,
          tx.merchant,
          tx.sourceFile,
          tx.createdAt ?? now,
          tx.updatedAt ?? now
        );
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  deleteSourceFile(sourceFile: string): void {
    db.prepare('DELETE FROM transactions WHERE sourceFile = ?').run(sourceFile);
  }

  find(filters: TransactionFilters = {}): Transaction[] {
    const where: string[] = [];
    const params: Array<string | number> = [];

    if (filters.q) {
      where.push('(memo LIKE ? OR tag LIKE ? OR category LIKE ? OR merchant LIKE ?)');
      const q = `%${filters.q}%`;
      params.push(q, q, q, q);
    }
    if (filters.from) {
      where.push('date >= ?');
      params.push(filters.from);
    }
    if (filters.to) {
      where.push('date <= ?');
      params.push(filters.to);
    }
    if (filters.category) {
      where.push('category = ?');
      params.push(filters.category);
    }
    if (filters.asset) {
      where.push('asset = ?');
      params.push(filters.asset);
    }
    if (filters.tag) {
      where.push('tag LIKE ?');
      params.push(`%${filters.tag}%`);
    }
    if (filters.period) {
      where.push("substr(date, 1, 7) = ?");
      params.push(filters.period);
    }
    if (filters.sourceFile) {
      where.push('sourceFile = ?');
      params.push(filters.sourceFile);
    }
    if (filters.type) {
      where.push('type = ?');
      params.push(filters.type);
    }
    if (filters.minAmount !== undefined) {
      where.push('ABS(amount) >= ?');
      params.push(filters.minAmount);
    }
    if (filters.maxAmount !== undefined) {
      where.push('ABS(amount) <= ?');
      params.push(filters.maxAmount);
    }

    const sortBy = allowedSort.has(filters.sortBy ?? '') ? filters.sortBy : 'date';
    const sortDir = filters.sortDir === 'asc' ? 'ASC' : 'DESC';
    const limit = Math.min(filters.limit ?? 500, 2000);
    const sql = `
      SELECT * FROM transactions
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ${sortBy} ${sortDir}, id ${sortDir}
      LIMIT ?
    `;
    return db.prepare(sql).all(...params, limit) as unknown as Transaction[];
  }

  recent(limit = 20): Transaction[] {
    return db.prepare('SELECT * FROM transactions ORDER BY date DESC, id DESC LIMIT ?').all(limit) as unknown as Transaction[];
  }

  periods(): string[] {
    const rows = db
      .prepare("SELECT DISTINCT substr(date, 1, 7) AS period FROM transactions ORDER BY period DESC")
      .all() as Array<{ period: string }>;
    return rows.map((row) => row.period);
  }
}

import { db } from '../database/db';
import { Category, TransactionType } from '../types/domain';

export class CategoryRepository {
  upsertMany(categories: Array<{ name: string; parentName: string; type: TransactionType | 'mixed' }>): void {
    const now = new Date().toISOString();
    const insert = db.prepare(`
      INSERT INTO categories(name, parentName, type, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(name, parentName) DO UPDATE SET type = excluded.type, updatedAt = excluded.updatedAt
    `);
    for (const category of categories.filter((item) => item.name)) {
      insert.run(category.name, category.parentName, category.type, now, now);
    }
  }

  all(): Category[] {
    return db.prepare('SELECT * FROM categories ORDER BY parentName, name').all() as unknown as Category[];
  }

  deleteUnused(): void {
    db.prepare(
      `
      DELETE FROM categories
      WHERE name NOT IN (
        SELECT category FROM transactions WHERE category != ''
        UNION
        SELECT subcategory FROM transactions WHERE subcategory != ''
      )
    `
    ).run();
  }
}

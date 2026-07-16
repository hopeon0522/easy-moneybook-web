import { db } from '../database/db';
import { Tag } from '../types/domain';

export class TagRepository {
  upsertMany(names: string[]): void {
    const now = new Date().toISOString();
    const insert = db.prepare(`
      INSERT INTO tags(name, createdAt, updatedAt)
      VALUES (?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET updatedAt = excluded.updatedAt
    `);
    for (const name of [...new Set(names.filter(Boolean))]) {
      insert.run(name, now, now);
    }
  }

  all(): Tag[] {
    return db.prepare('SELECT * FROM tags ORDER BY name').all() as unknown as Tag[];
  }

  deleteUnused(): void {
    db.prepare("DELETE FROM tags WHERE name NOT IN (SELECT tag FROM transactions WHERE tag != '')").run();
  }
}

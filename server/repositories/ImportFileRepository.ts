import { db } from '../database/db';

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

export class ImportFileRepository {
  upsert(input: {
    sourceFile: string;
    storedPath: string;
    transactionCount: number;
    firstDate: string;
    lastDate: string;
  }): void {
    const now = new Date().toISOString();
    db.prepare(
      `
      INSERT INTO import_files(sourceFile, storedPath, transactionCount, firstDate, lastDate, uploadedAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sourceFile) DO UPDATE SET
        storedPath = excluded.storedPath,
        transactionCount = excluded.transactionCount,
        firstDate = excluded.firstDate,
        lastDate = excluded.lastDate,
        updatedAt = excluded.updatedAt
    `
    ).run(input.sourceFile, input.storedPath, input.transactionCount, input.firstDate, input.lastDate, now, now);
  }

  all(): ImportFile[] {
    return db
      .prepare(
        `
        SELECT * FROM import_files
        UNION
        SELECT
          0 AS id,
          sourceFile,
          '' AS storedPath,
          COUNT(*) AS transactionCount,
          MIN(date) AS firstDate,
          MAX(date) AS lastDate,
          MIN(createdAt) AS uploadedAt,
          MAX(updatedAt) AS updatedAt
        FROM transactions
        WHERE sourceFile NOT IN (SELECT sourceFile FROM import_files)
        GROUP BY sourceFile
        ORDER BY lastDate DESC, sourceFile ASC
      `
      )
      .all() as unknown as ImportFile[];
  }

  delete(sourceFile: string): void {
    db.prepare('DELETE FROM import_files WHERE sourceFile = ?').run(sourceFile);
  }
}

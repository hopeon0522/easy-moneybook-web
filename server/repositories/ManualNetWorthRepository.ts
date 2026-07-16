import { db } from '../database/db';

export interface ManualNetWorthPoint {
  id: number;
  period: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
}

export class ManualNetWorthRepository {
  all(): ManualNetWorthPoint[] {
    return db.prepare('SELECT * FROM manual_net_worth ORDER BY period').all() as unknown as ManualNetWorthPoint[];
  }

  create(input: { period: string; amount: number }): ManualNetWorthPoint {
    const period = input.period.trim();
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new Error('년/월은 YYYY-MM 형식으로 입력해 주세요.');
    }
    const month = Number(period.slice(5, 7));
    if (month < 1 || month > 12) {
      throw new Error('월은 1월부터 12월 사이로 입력해 주세요.');
    }
    if (!Number.isFinite(input.amount)) {
      throw new Error('순자산 금액을 숫자로 입력해 주세요.');
    }

    const firstTransaction = db.prepare("SELECT MIN(substr(date, 1, 7)) AS period FROM transactions").get() as { period?: string | null };
    if (firstTransaction.period && period >= firstTransaction.period) {
      throw new Error(`수동 순자산은 업로드된 첫 월(${firstTransaction.period})보다 이전 월만 입력할 수 있습니다.`);
    }

    const now = new Date().toISOString();
    db.prepare(
      `
      INSERT INTO manual_net_worth (period, amount, createdAt, updatedAt)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(period) DO UPDATE SET
        amount = excluded.amount,
        updatedAt = excluded.updatedAt
    `
    ).run(period, input.amount, now, now);

    return db.prepare('SELECT * FROM manual_net_worth WHERE period = ?').get(period) as unknown as ManualNetWorthPoint;
  }

  delete(id: number): void {
    db.prepare('DELETE FROM manual_net_worth WHERE id = ?').run(id);
  }
}

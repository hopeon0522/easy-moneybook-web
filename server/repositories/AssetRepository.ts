import { db } from '../database/db';
import { Asset } from '../types/domain';

export type AssetKind = 'savings' | 'investment' | 'card' | 'checkCard' | 'loan' | 'other';
const untrackedAssetName = '자산미반영';

function inferAssetKind(name: string): AssetKind {
  if (/체크카드|하나머니|네이버페이머니/.test(name)) return 'checkCard';
  if (/카드|백화점|하이패스/.test(name)) return 'card';
  if (/대출|담보|전세|마이너스/.test(name)) return 'loan';
  if (/증권|연금|ISA|주식|생명|출자금|청약/.test(name)) return 'investment';
  if (/통장|입출금|예금|저축|페이|머니|현금|수원페이|은행|카카오|하나|KB|우리|새마을/.test(name)) return 'savings';
  return 'other';
}

export class AssetRepository {
  upsertMany(names: string[]): void {
    const now = new Date().toISOString();
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sortOrder), 0) AS value FROM assets').get() as { value: number };
    let order = maxOrder.value;
    const insert = db.prepare(`
      INSERT INTO assets(name, kind, initialValue, isHidden, isArchived, linkedAsset, sortOrder, createdAt, updatedAt)
      VALUES (?, ?, 0, 0, 0, '', ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        kind = CASE WHEN assets.kind = 'account' OR assets.kind = '' THEN excluded.kind ELSE assets.kind END,
        updatedAt = excluded.updatedAt
    `);
    for (const name of [...new Set(names.filter(Boolean))]) {
      order += 10;
      insert.run(name, inferAssetKind(name), order, now, now);
    }
  }

  all(): Asset[] {
    return db
      .prepare(
        `
        WITH latest AS (
          SELECT COALESCE(MAX(substr(date, 1, 7)), '') AS period
          FROM transactions
        ),
        transaction_values AS (
          SELECT
            assets.id,
            COALESCE(SUM(transactions.amount), 0) AS transactionValue
          FROM assets
          LEFT JOIN transactions
            ON transactions.asset = assets.name
            AND (
              (SELECT period FROM latest) = ''
              OR substr(transactions.date, 1, 7) <= (SELECT period FROM latest)
            )
          GROUP BY assets.id
        ),
        linked_values AS (
          SELECT
            linkedAsset AS name,
            SUM(transactionValue) AS linkedTransactionValue
          FROM assets
          JOIN transaction_values ON transaction_values.id = assets.id
          WHERE assets.kind = 'checkCard' AND linkedAsset != ''
          GROUP BY linkedAsset
        )
        SELECT
          assets.*,
          CASE
            WHEN assets.kind = 'checkCard'
              THEN assets.initialValue
            ELSE assets.initialValue
              + COALESCE(transaction_values.transactionValue, 0)
              + COALESCE(linked_values.linkedTransactionValue, 0)
          END AS currentValue
        FROM assets
        LEFT JOIN transaction_values ON transaction_values.id = assets.id
        LEFT JOIN linked_values ON linked_values.name = assets.name
        ORDER BY isArchived ASC, isHidden ASC, sortOrder ASC, name ASC
      `
      )
      .all() as unknown as Asset[];
  }

  update(input: {
    id: number;
    kind: AssetKind;
    initialValue: number;
    isHidden: boolean;
    isArchived: boolean;
    linkedAsset: string;
    sortOrder: number;
  }): void {
    db.prepare(
      `
      UPDATE assets
      SET kind = ?, initialValue = ?, isHidden = ?, isArchived = ?, linkedAsset = ?, sortOrder = ?, updatedAt = ?
      WHERE id = ?
    `
    ).run(
      input.kind,
      input.initialValue,
      input.isHidden ? 1 : 0,
      input.isArchived ? 1 : 0,
      input.linkedAsset,
      input.sortOrder,
      new Date().toISOString(),
      input.id
    );
  }

  ensureCalculationExcluded(name: string): void {
    const now = new Date().toISOString();
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sortOrder), 0) AS value FROM assets').get() as { value: number };
    db.prepare(
      `
      INSERT INTO assets(name, kind, initialValue, isHidden, isArchived, linkedAsset, sortOrder, createdAt, updatedAt)
      VALUES (?, 'other', 0, 1, 0, '', ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        isHidden = 1,
        updatedAt = excluded.updatedAt
    `
    ).run(name, maxOrder.value + 10, now, now);
  }

  normalizeExistingKinds(): void {
    const rows = db.prepare("SELECT id, name, kind FROM assets WHERE kind = 'account' OR kind = ''").all() as Array<{
      id: number;
      name: string;
      kind: string;
    }>;
    const update = db.prepare('UPDATE assets SET kind = ?, updatedAt = ? WHERE id = ?');
    for (const row of rows) {
      update.run(inferAssetKind(row.name), new Date().toISOString(), row.id);
    }
  }

  deleteUnusedZeroInitialAssets(): void {
    db.prepare(
      `
      DELETE FROM assets
      WHERE initialValue = 0
        AND name != ?
        AND name NOT IN (
          SELECT asset FROM transactions WHERE asset != ''
          UNION
          SELECT counterAsset FROM transactions WHERE counterAsset != ''
        )
    `
    ).run(untrackedAssetName);
  }
}

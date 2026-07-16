import { db } from '../database/db';
import { TransactionRepository } from '../repositories/TransactionRepository';

export class AnalyticsService {
  constructor(private readonly transactions = new TransactionRepository()) {}

  private latestPeriod(): string {
    const latestMonth = db
      .prepare("SELECT substr(date, 1, 7) AS month FROM transactions ORDER BY date DESC LIMIT 1")
      .get() as { month?: string };
    return latestMonth.month ?? '';
  }

  private balanceSummary(period: string) {
    const rows = db
      .prepare(
        `
        SELECT
          assets.name AS asset,
          assets.kind AS kind,
          assets.initialValue + COALESCE(SUM(transactions.amount), 0) AS value
        FROM assets
        LEFT JOIN transactions
          ON transactions.asset = assets.name
          AND (? = '' OR substr(transactions.date, 1, 7) <= ?)
        WHERE assets.isHidden = 0
        GROUP BY assets.id
      `
      )
      .all(period, period) as Array<{ asset: string; kind: string; value: number }>;
    const liabilityKinds = new Set(['card', 'loan']);
    const assetValues = rows.filter((row) => !liabilityKinds.has(row.kind)).map((row) => Number(row.value));
    const totalAssets = rows
      .filter((row) => !liabilityKinds.has(row.kind))
      .reduce((sum, row) => sum + Math.max(0, Number(row.value)), 0);
    const liabilities = rows
      .filter((row) => liabilityKinds.has(row.kind))
      .reduce((sum, row) => sum + Math.abs(Number(row.value)), 0);
    return {
      totalAssets,
      liabilities,
      netWorth: assetValues.reduce((sum, value) => sum + value, 0) - liabilities
    };
  }

  private manualNetWorthPoints() {
    return db
      .prepare('SELECT period AS month, amount AS netWorth, 1 AS isManual FROM manual_net_worth ORDER BY period')
      .all() as Array<{ month: string; netWorth: number; isManual: number }>;
  }

  private yearlyNetWorthRows(rows: Array<{ month: string; netWorth: number; isManual?: number }>) {
    const byYear = new Map<string, { year: string; month: string; netWorth: number; isManual?: number }>();
    for (const row of rows) {
      const year = row.month.slice(0, 4);
      const current = byYear.get(year);
      if (!current || row.month > current.month) {
        byYear.set(year, { year, month: row.month, netWorth: row.netWorth, isManual: row.isManual });
      }
    }
    return [...byYear.values()].sort((a, b) => a.year.localeCompare(b.year));
  }

  dashboard() {
    const month = this.latestPeriod();
    const monthRows = db
      .prepare(
        `
        SELECT
          type,
          SUM(CASE WHEN type = 'expense' THEN -amount ELSE amount END) AS value
        FROM transactions
        WHERE substr(date, 1, 7) = ?
        GROUP BY type
      `
      )
      .all(month) as Array<{ type: string; value: number }>;

    const byType = Object.fromEntries(monthRows.map((row) => [row.type, Number(row.value ?? 0)]));
    const balance = this.balanceSummary(month);
    const calculatedAssetLine = db
      .prepare(
        `
          WITH monthly AS (
            SELECT substr(date, 1, 7) AS month, SUM(amount) AS netChange
            FROM transactions
            WHERE asset IN (SELECT name FROM assets WHERE isHidden = 0)
            GROUP BY month
          ),
          base AS (
            SELECT
              COALESCE(SUM(CASE WHEN kind IN ('card', 'loan') THEN -ABS(initialValue) ELSE initialValue END), 0) AS initialNetWorth
            FROM assets
            WHERE isHidden = 0
          )
          SELECT
            month,
            (SELECT initialNetWorth FROM base) +
              SUM(netChange) OVER (ORDER BY month ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS netWorth,
            0 AS isManual
          FROM monthly
          ORDER BY month
        `
      )
      .all() as Array<{ month: string; netWorth: number; isManual: number }>;
    const assetLine = [...this.manualNetWorthPoints(), ...calculatedAssetLine].sort((a, b) => a.month.localeCompare(b.month));
    const assetLineYearly = this.yearlyNetWorthRows(assetLine);

    return {
      summary: {
        latestPeriod: month,
        monthIncome: byType.income ?? 0,
        monthExpense: byType.expense ?? 0,
        monthNet: (byType.income ?? 0) - (byType.expense ?? 0),
        totalAssets: balance.totalAssets,
        liabilities: balance.liabilities,
        netWorth: balance.netWorth
      },
      recent: this.transactions.recent(20),
      categoryPie: db
        .prepare(
          `
          SELECT category AS name, SUM(-amount) AS value
          FROM transactions
          WHERE type = 'expense' AND substr(date, 1, 7) = ?
          GROUP BY category
          HAVING value > 0
          ORDER BY value DESC
          LIMIT 12
        `
        )
        .all(month),
      monthlyBars: db
        .prepare(
          `
          WITH monthly AS (
            SELECT substr(date, 1, 7) AS month,
                   SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income,
                   SUM(CASE WHEN type = 'expense' THEN -amount ELSE 0 END) AS expense
            FROM transactions
            GROUP BY month
            ORDER BY month DESC
            LIMIT 6
          )
          SELECT month, income, expense
          FROM monthly
          ORDER BY month
        `
        )
        .all(),
      assetLine,
      assetLineYearly,
      debtRatioLine: db
        .prepare(
          `
          WITH months AS (
            SELECT DISTINCT substr(date, 1, 7) AS month
            FROM transactions
          ),
          asset_values AS (
            SELECT
              months.month,
              assets.kind,
              assets.initialValue + COALESCE((
                SELECT SUM(transactions.amount)
                FROM transactions
                WHERE transactions.asset = assets.name
                  AND substr(transactions.date, 1, 7) <= months.month
              ), 0) AS value
            FROM months
            CROSS JOIN assets
            WHERE assets.isHidden = 0
          )
          SELECT
            month,
            CASE
              WHEN SUM(CASE WHEN kind NOT IN ('card', 'loan') THEN max(value, 0) ELSE 0 END) = 0 THEN 0
              ELSE
                SUM(CASE WHEN kind IN ('card', 'loan') THEN ABS(value) ELSE 0 END) * 100.0 /
                SUM(CASE WHEN kind NOT IN ('card', 'loan') THEN max(value, 0) ELSE 0 END)
            END AS debtRatio
          FROM asset_values
          GROUP BY month
          ORDER BY month
        `
        )
        .all(),
      debtRatioLineYearly: db
        .prepare(
          `
          WITH months AS (
            SELECT DISTINCT substr(date, 1, 7) AS month
            FROM transactions
          ),
          asset_values AS (
            SELECT
              months.month,
              assets.kind,
              assets.initialValue + COALESCE((
                SELECT SUM(transactions.amount)
                FROM transactions
                WHERE transactions.asset = assets.name
                  AND substr(transactions.date, 1, 7) <= months.month
              ), 0) AS value
            FROM months
            CROSS JOIN assets
            WHERE assets.isHidden = 0
          ),
          monthly AS (
            SELECT
              month,
              CASE
                WHEN SUM(CASE WHEN kind NOT IN ('card', 'loan') THEN max(value, 0) ELSE 0 END) = 0 THEN 0
                ELSE
                  SUM(CASE WHEN kind IN ('card', 'loan') THEN ABS(value) ELSE 0 END) * 100.0 /
                  SUM(CASE WHEN kind NOT IN ('card', 'loan') THEN max(value, 0) ELSE 0 END)
              END AS debtRatio
            FROM asset_values
            GROUP BY month
          ),
          yearly_last_month AS (
            SELECT substr(month, 1, 4) AS year, MAX(month) AS month
            FROM monthly
            GROUP BY year
          )
          SELECT yearly_last_month.year, yearly_last_month.month, monthly.debtRatio
          FROM monthly
          JOIN yearly_last_month ON yearly_last_month.month = monthly.month
          ORDER BY yearly_last_month.year
        `
        )
        .all()
    };
  }

  categoryExpense(period?: string, type: 'income' | 'expense' = 'expense') {
    const selectedPeriod = period || this.latestPeriod();
    const totals = db
      .prepare(
        `
        SELECT
          SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income,
          SUM(CASE WHEN type = 'expense' THEN -amount ELSE 0 END) AS expense
        FROM transactions
        WHERE substr(date, 1, 7) = ?
      `
      )
      .get(selectedPeriod) as { income: number | null; expense: number | null };

    return {
      selectedPeriod,
      type,
      summary: {
        income: Number(totals.income ?? 0),
        expense: Number(totals.expense ?? 0)
      },
      periods: this.transactions.periods(),
      rows: db
        .prepare(
          `
          SELECT
            category AS name,
            SUM(CASE WHEN ? = 'expense' THEN -amount ELSE ABS(amount) END) AS value,
            SUM(CASE WHEN ? = 'expense' THEN -amount ELSE amount END) AS signedValue
          FROM transactions
          WHERE type = ? AND substr(date, 1, 7) = ?
          GROUP BY category
          ORDER BY ABS(signedValue) DESC
        `
        )
        .all(type, type, type, selectedPeriod)
    };
  }

  statistics() {
    return {
      weekdaySpend: db
        .prepare(
          "SELECT strftime('%w', date) AS weekday, SUM(-amount) AS value FROM transactions WHERE type = 'expense' GROUP BY weekday ORDER BY weekday"
        )
        .all(),
      accountSpend: db
        .prepare(
          "SELECT asset AS name, SUM(-amount) AS value FROM transactions WHERE type = 'expense' GROUP BY asset ORDER BY value DESC LIMIT 20"
        )
        .all(),
      topCategories: db
        .prepare(
          "SELECT category AS name, SUM(-amount) AS value FROM transactions WHERE type = 'expense' GROUP BY category ORDER BY value DESC LIMIT 10"
        )
        .all(),
      topMerchants: db
        .prepare(
          "SELECT merchant AS name, SUM(-amount) AS value FROM transactions WHERE type = 'expense' AND merchant != '' GROUP BY merchant ORDER BY value DESC LIMIT 10"
        )
        .all()
    };
  }
}

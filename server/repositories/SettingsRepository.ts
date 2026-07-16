import { db } from '../database/db';

export interface AppSettings {
  appTitle: string;
  appSubtitle: string;
  chartGridXMonths: number;
  chartGridYWon: number;
}

const defaults: AppSettings = {
  appTitle: 'EasyMoneyBook Web',
  appSubtitle: '편한가계부 Excel 백업 분석 공간',
  chartGridXMonths: 12,
  chartGridYWon: 100_000_000
};

export class SettingsRepository {
  get(): AppSettings {
    const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
    const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return {
      appTitle: values.appTitle || defaults.appTitle,
      appSubtitle: values.appSubtitle || defaults.appSubtitle,
      chartGridXMonths: Math.max(1, Number(values.chartGridXMonths || defaults.chartGridXMonths)),
      chartGridYWon: Math.max(100_000_000, Number(values.chartGridYWon || defaults.chartGridYWon))
    };
  }

  update(input: Partial<AppSettings>): AppSettings {
    const current = this.get();
    const next = {
      appTitle: input.appTitle?.trim() || current.appTitle,
      appSubtitle: input.appSubtitle?.trim() || current.appSubtitle,
      chartGridXMonths: Math.max(1, Math.round(Number(input.chartGridXMonths || current.chartGridXMonths))),
      chartGridYWon: Math.max(100_000_000, Math.round(Number(input.chartGridYWon || current.chartGridYWon) / 100_000_000) * 100_000_000)
    };
    const now = new Date().toISOString();
    const statement = db.prepare(
      `
      INSERT INTO settings(key, value, updatedAt)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
    `
    );
    statement.run('appTitle', next.appTitle, now);
    statement.run('appSubtitle', next.appSubtitle, now);
    statement.run('chartGridXMonths', String(next.chartGridXMonths), now);
    statement.run('chartGridYWon', String(next.chartGridYWon), now);
    return next;
  }
}

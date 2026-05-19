import { query, execute } from '../config/database';

class PmoSettingsService {
  async ensureTable() {
    await execute(`
      CREATE TABLE IF NOT EXISTS pmo_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        settings JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await execute(`
      INSERT INTO pmo_settings (id, settings)
      VALUES (1, '{}')
      ON CONFLICT (id) DO NOTHING
    `);
  }

  async get(): Promise<Record<string, any>> {
    await this.ensureTable();
    const result = await query(`SELECT settings FROM pmo_settings WHERE id = 1`);
    return result.rows[0]?.settings ?? {};
  }

  async save(settings: Record<string, any>): Promise<Record<string, any>> {
    await this.ensureTable();
    await execute(
      `UPDATE pmo_settings SET settings = $1, updated_at = NOW() WHERE id = 1`,
      [JSON.stringify(settings)]
    );
    return this.get();
  }

  async patch(partial: Record<string, any>): Promise<Record<string, any>> {
    await this.ensureTable();
    const current = await this.get();
    const merged = { ...current, ...partial };
    return this.save(merged);
  }
}

export const pmoSettingsService = new PmoSettingsService();

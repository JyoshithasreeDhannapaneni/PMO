import { randomBytes } from 'crypto';
import { query, execute } from '../config/database';

function generateKey(): string {
  return `pmo_${randomBytes(24).toString('hex')}`;
}

export const apiKeyService = {
  // Lazily creates a key for a scope on first read — the Settings UI has no "generate your
  // first key" empty state, it expects GET to always return a usable key.
  async getOrCreate(scope: string): Promise<string> {
    const existing = await query(`SELECT key FROM api_keys WHERE scope = $1`, [scope]);
    if (existing.rows.length > 0) return existing.rows[0].key as string;

    const key = generateKey();
    await execute(
      `INSERT INTO api_keys (scope, key) VALUES ($1, $2)
       ON CONFLICT (scope) DO NOTHING`,
      [scope, key]
    );
    const row = (await query(`SELECT key FROM api_keys WHERE scope = $1`, [scope])).rows[0];
    return row.key as string;
  },

  async regenerate(scope: string): Promise<string> {
    const key = generateKey();
    await execute(
      `INSERT INTO api_keys (scope, key, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (scope) DO UPDATE SET key = $2, updated_at = NOW()`,
      [scope, key]
    );
    return key;
  },
};

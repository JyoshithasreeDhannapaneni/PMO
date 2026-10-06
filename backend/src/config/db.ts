import { Pool } from 'pg';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';
dotenv.config();

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123',
  database: process.env.DB_NAME || 'pmo',
  port: Number(process.env.DB_PORT) || 5432,
  max: 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// An idle pooled client whose connection drops (Postgres restart, network blip) emits
// 'error' on the pool; with no listener Node treats that as an uncaught exception and the
// whole backend exits. The pool already discards that client, so logging is enough.
pool.on('error', (err) => {
  logger.error('[DB] Idle client error (client discarded, pool continues):', err.message);
});

// Errors raised while *acquiring* a connection — the query never reached Postgres, so
// retrying can't run a write twice. Production self-heal incidents (Sep–Oct 2026) were
// bursts of exactly these two pg messages under load.
const CONNECT_PHASE_ERRORS = [
  'timeout exceeded when trying to connect',
  'Connection terminated due to connection timeout',
];

export function isTransientDbConnectError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return CONNECT_PHASE_ERRORS.some((m) => msg.includes(m));
}

const RETRY_DELAYS_MS = [250, 1000];

async function poolQueryWithRetry(sql: string, params: any[]) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await pool.query(sql, params);
    } catch (err) {
      if (!isTransientDbConnectError(err) || attempt >= RETRY_DELAYS_MS.length) throw err;
      // Pool counts tell the next burst apart: waiting > 0 with total at max = pool
      // exhaustion (something holding connections); low total = Postgres slow to accept.
      logger.warn(
        `[DB] Connect failed (${(err as Error).message}); retry ${attempt + 1}/${RETRY_DELAYS_MS.length} — ` +
        `pool total=${pool.totalCount} idle=${pool.idleCount} waiting=${pool.waitingCount}`
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
}

// Convert MySQL-style ? placeholders to PostgreSQL $1, $2, ...
function convertPlaceholders(text: string): string {
  let i = 0;
  return text.replace(/\?/g, () => `$${++i}`);
}

export async function query(text: string, params?: any[]) {
  const sql = convertPlaceholders(text);
  const result = await poolQueryWithRetry(sql, params || []);
  return {
    rows: result.rows,
    rowCount: result.rowCount ?? result.rows.length,
  };
}

export async function execute(text: string, params?: any[]) {
  const sql = convertPlaceholders(text);
  const result = await poolQueryWithRetry(sql, params || []);
  return result;
}

export async function transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

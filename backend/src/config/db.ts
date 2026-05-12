import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pmo_tracker',
  port: Number(process.env.DB_PORT) || 5432,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Convert MySQL-style ? placeholders to PostgreSQL $1, $2, ...
function convertPlaceholders(text: string): string {
  let i = 0;
  return text.replace(/\?/g, () => `$${++i}`);
}

export async function query(text: string, params?: any[]) {
  const sql = convertPlaceholders(text);
  const result = await pool.query(sql, params || []);
  return {
    rows: result.rows,
    rowCount: result.rowCount ?? result.rows.length,
  };
}

export async function execute(text: string, params?: any[]) {
  const sql = convertPlaceholders(text);
  const result = await pool.query(sql, params || []);
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

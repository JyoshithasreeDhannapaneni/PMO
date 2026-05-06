import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123',
  database: process.env.DB_NAME || 'pmo',
  port: Number(process.env.DB_PORT) || 5432,
  max: 10,
});

export async function query(text: string, params?: any[]) {
  const result = await pool.query(text, params);
  return {
    rows: result.rows,
    rowCount: result.rowCount || 0,
  };
}

export async function execute(text: string, params?: any[]) {
  return await pool.query(text, params);
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

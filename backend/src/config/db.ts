import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123',
  database: process.env.DB_NAME || 'pmo',
  port: Number(process.env.DB_PORT) || 5432,
});

// Convert MySQL ? placeholders to PostgreSQL $1, $2, etc.
function convertPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

export async function query(text: string, params?: any[]) {
  const pgQuery = convertPlaceholders(text);
  const result = await pool.query(pgQuery, params);
  return {
    rows: result.rows,
    rowCount: result.rowCount || 0,
  };
}

export async function execute(text: string, params?: any[]) {
  const pgQuery = convertPlaceholders(text);
  const result = await pool.query(pgQuery, params);
  return result;
}

export async function transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  
  // Wrap client.query to convert placeholders
  const originalQuery = client.query.bind(client);
  client.query = (text: string, params?: any[]) => {
    const pgQuery = convertPlaceholders(text);
    return originalQuery(pgQuery, params);
  };
  
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

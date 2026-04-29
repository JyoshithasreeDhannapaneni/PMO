import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pmo_tracker',
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Convert PostgreSQL $1,$2 placeholders to MySQL ? and deduplicate repeated params
function convertPlaceholders(sql: string, params?: any[]): { sql: string; params: any[] } {
  if (!params || params.length === 0) return { sql, params: params || [] };

  // Check if already using ? placeholders (from seed.ts style)
  if (sql.includes('?') && !sql.match(/\$\d/)) {
    return { sql, params };
  }

  // Replace $N with ? and reorder params to match order of appearance
  const usedIndices: number[] = [];
  const converted = sql.replace(/\$(\d+)/g, (_, n) => {
    usedIndices.push(parseInt(n, 10) - 1);
    return '?';
  });

  return { sql: converted, params: usedIndices.map((i) => params[i]) };
}

export async function query(text: string, params?: any[]) {
  const { sql, params: p } = convertPlaceholders(text, params);
  const [rows] = await pool.execute(sql, p);
  return {
    rows: rows as any[],
    rowCount: Array.isArray(rows) ? rows.length : 0,
  };
}

export async function execute(text: string, params?: any[]) {
  const { sql, params: p } = convertPlaceholders(text, params);
  const [result] = await pool.execute(sql, p);
  return result;
}

export async function transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();

  // Wrap conn.query to convert placeholders transparently
  const origQuery = conn.query.bind(conn);
  const origExecute = conn.execute.bind(conn);
  (conn as any).query = (text: string, params?: any[]) => {
    const { sql, params: p } = convertPlaceholders(text, params);
    return origQuery(sql, p);
  };
  (conn as any).execute = (text: string, params?: any[]) => {
    const { sql, params: p } = convertPlaceholders(text, params);
    return origExecute(sql, p);
  };

  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

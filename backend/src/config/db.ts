import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pmo_tracker',
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+00:00',
});

export async function query(text: string, params?: any[]) {
  const [rows] = await pool.execute(text, params || []);
  return {
    rows: rows as any[],
    rowCount: (rows as any[]).length,
  };
}

export async function execute(text: string, params?: any[]) {
  const [result] = await pool.execute(text, params || []);
  return result;
}

export async function transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

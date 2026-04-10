import 'dotenv/config';
import mysql, { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { logger } from '../utils/logger';

let pool: Pool;

function createPool(): Pool {
  const dbUrl = process.env.DATABASE_URL;
  
  if (dbUrl) {
    return mysql.createPool(dbUrl);
  }
  
  return mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pmo_tracker',
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0,
  });
}

pool = createPool();

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export async function query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    // Convert PostgreSQL-style $1, $2 placeholders to MySQL ? placeholders
    // and expand parameters for repeated placeholders (e.g., $1 used twice)
    const expandedParams: any[] = [];
    const mysqlQuery = text.replace(/\$(\d+)/g, (_, num) => {
      const paramIndex = parseInt(num, 10) - 1;
      if (params && paramIndex < params.length) {
        expandedParams.push(params[paramIndex]);
      }
      return '?';
    });
    
    let rows: RowDataPacket[];
    if (expandedParams.length > 0) {
      [rows] = await pool.execute<RowDataPacket[]>(mysqlQuery, expandedParams);
    } else if (params && params.length > 0) {
      [rows] = await pool.execute<RowDataPacket[]>(mysqlQuery, params);
    } else {
      [rows] = await pool.query<RowDataPacket[]>(mysqlQuery);
    }
    const duration = Date.now() - start;
    
    if (process.env.NODE_ENV === 'development') {
      logger.debug(`Query executed in ${duration}ms: ${text.substring(0, 100)}...`);
    }
    
    return {
      rows: rows as T[],
      rowCount: Array.isArray(rows) ? rows.length : 0,
    };
  } catch (error) {
    logger.error(`Query error: ${text}`, error);
    throw error;
  }
}

export async function execute(text: string, params?: any[]): Promise<ResultSetHeader> {
  // Convert PostgreSQL-style $1, $2 placeholders to MySQL ? placeholders
  // and expand parameters for repeated placeholders
  const expandedParams: any[] = [];
  const mysqlQuery = text.replace(/\$(\d+)/g, (_, num) => {
    const paramIndex = parseInt(num, 10) - 1;
    if (params && paramIndex < params.length) {
      expandedParams.push(params[paramIndex]);
    }
    return '?';
  });
  
  const finalParams = expandedParams.length > 0 ? expandedParams : params;
  const [result] = await pool.execute<ResultSetHeader>(mysqlQuery, finalParams);
  return result;
}

export async function getClient(): Promise<PoolConnection> {
  return pool.getConnection();
}

export async function transaction<T>(callback: (client: PoolConnection) => Promise<T>): Promise<T> {
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

export async function connectDatabase(): Promise<void> {
  try {
    const connection = await pool.getConnection();
    await connection.query('SELECT 1');
    connection.release();
    logger.info('✅ MySQL database connected successfully');
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

export async function disconnectDatabase(): Promise<void> {
  await pool.end();
  logger.info('Database disconnected');
}

export { pool };

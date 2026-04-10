require('dotenv/config');
const mysql = require('mysql2/promise');

async function runMigration() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'pmo_tracker',
  });

  console.log('Running Microsoft OAuth migration...');

  try {
    // Check if columns already exist
    const [columns] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'
    `, [process.env.DB_NAME || 'pmo_tracker']);
    
    const columnNames = columns.map(c => c.COLUMN_NAME);
    
    // Add microsoft_id column if it doesn't exist
    if (!columnNames.includes('microsoft_id')) {
      await pool.query(`ALTER TABLE users ADD COLUMN microsoft_id VARCHAR(255) NULL`);
      console.log('Added microsoft_id column');
    } else {
      console.log('microsoft_id column already exists');
    }
    
    // Add auth_provider column if it doesn't exist
    if (!columnNames.includes('auth_provider')) {
      await pool.query(`ALTER TABLE users ADD COLUMN auth_provider VARCHAR(50) DEFAULT 'local'`);
      console.log('Added auth_provider column');
    } else {
      console.log('auth_provider column already exists');
    }
    
    // Make password nullable for Microsoft users
    await pool.query(`ALTER TABLE users MODIFY COLUMN password VARCHAR(255) NULL`);
    console.log('Modified password column to be nullable');
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error.message);
  } finally {
    await pool.end();
  }
}

runMigration();

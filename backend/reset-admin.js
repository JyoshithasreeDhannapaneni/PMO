const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pmo_tracker',
  port: Number(process.env.DB_PORT) || 5432,
});

const hash = crypto.createHash('sha256').update('admin123').digest('hex');

async function run() {
  const existing = await pool.query("SELECT id, username, role FROM users WHERE username = 'admin'");

  if (existing.rows.length === 0) {
    const { v4: uuidv4 } = require('uuid');
    await pool.query(
      `INSERT INTO users (id, name, username, email, password, role) VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), 'Administrator', 'admin', 'admin@company.com', hash, 'ADMIN']
    );
    console.log('✅ Admin user created — username: admin  password: admin123');
  } else {
    await pool.query("UPDATE users SET password = $1 WHERE username = 'admin'", [hash]);
    console.log('✅ Admin password reset — username: admin  password: admin123');
  }

  await pool.end();
}

run().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });

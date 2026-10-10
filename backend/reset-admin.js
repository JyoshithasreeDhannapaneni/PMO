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

// No default: a hardcoded reset password ends up in git and works on every deployment.
const newPassword = process.env.ADMIN_INITIAL_PASSWORD;
if (!newPassword || newPassword.length < 12) {
  console.error('❌ Set ADMIN_INITIAL_PASSWORD (12+ characters) for this run, e.g. ADMIN_INITIAL_PASSWORD=... node reset-admin.js');
  process.exit(1);
}
const hash = crypto.createHash('sha256').update(newPassword).digest('hex');

async function run() {
  const existing = await pool.query("SELECT id, username, role FROM users WHERE username = 'admin'");

  if (existing.rows.length === 0) {
    const { v4: uuidv4 } = require('uuid');
    await pool.query(
      `INSERT INTO users (id, name, username, email, password, role) VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), 'Administrator', 'admin', 'admin@company.com', hash, 'ADMIN']
    );
    console.log('✅ Admin user created — username: admin (password from ADMIN_INITIAL_PASSWORD)');
  } else {
    await pool.query("UPDATE users SET password = $1 WHERE username = 'admin'", [hash]);
    console.log('✅ Admin password reset — username: admin (password from ADMIN_INITIAL_PASSWORD)');
  }

  await pool.end();
}

run().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });

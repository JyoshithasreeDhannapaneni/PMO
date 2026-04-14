import { Pool } from 'pg';

export const pool = new Pool({
  host: 'postgres',
  user: 'pmo_user',
  password: 'pmo_password',
  database: 'pmo_tracker',
  port: 5432,
});

import pool from '../config/database.js';

const alter = async () => {
  try {
    // Add email column if not present (nullable)
    await pool.query("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS email VARCHAR(100) NULL");
    // Add permissions column if not present
    await pool.query("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS permissions TEXT NULL");
    console.log('OK: ensured email and permissions columns exist on admin_users');
    process.exit(0);
  } catch (err) {
    console.error('Failed to alter admin_users:', err && (err.stack || err.message || err));
    process.exit(1);
  }
};

alter();

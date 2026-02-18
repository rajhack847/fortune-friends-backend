import pool from '../config/database.js';

const run = async () => {
  try {
    const [rows] = await pool.query('DESCRIBE admin_users');
    console.log('admin_users schema:');
    console.table(rows);
    process.exit(0);
  } catch (err) {
    console.error('Failed to describe admin_users:', err && (err.stack || err.message || err));
    process.exit(1);
  }
};

run();

import pool from '../config/database.js';

async function columnExists(connection, columnName) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
    [columnName]
  );
  return rows[0].cnt > 0;
}

async function ensureColumns() {
  const connection = await pool.getConnection();
  try {
    console.log('🔧 Ensuring profile/KYC columns on users table...');

    const checks = [
      { name: 'address', sql: "ALTER TABLE users ADD COLUMN address VARCHAR(255) DEFAULT NULL" },
      { name: 'pincode', sql: "ALTER TABLE users ADD COLUMN pincode VARCHAR(20) DEFAULT NULL" },
      { name: 'profile_picture_url', sql: "ALTER TABLE users ADD COLUMN profile_picture_url VARCHAR(255) DEFAULT NULL" },
      { name: 'kyc_document_url', sql: "ALTER TABLE users ADD COLUMN kyc_document_url VARCHAR(255) DEFAULT NULL" },
      { name: 'kyc_status', sql: "ALTER TABLE users ADD COLUMN kyc_status ENUM('none','pending','submitted','pending_review','verified','rejected') DEFAULT 'none'" },
      { name: 'kyc_document_front_url', sql: "ALTER TABLE users ADD COLUMN kyc_document_front_url VARCHAR(255) DEFAULT NULL" },
      { name: 'kyc_document_back_url', sql: "ALTER TABLE users ADD COLUMN kyc_document_back_url VARCHAR(255) DEFAULT NULL" },
      { name: 'kyc_document_pan_url', sql: "ALTER TABLE users ADD COLUMN kyc_document_pan_url VARCHAR(255) DEFAULT NULL" },
      { name: 'kyc_rejection_reason', sql: "ALTER TABLE users ADD COLUMN kyc_rejection_reason TEXT DEFAULT NULL" },
      { name: 'kyc_submitted_at', sql: "ALTER TABLE users ADD COLUMN kyc_submitted_at TIMESTAMP NULL" },
      { name: 'profile_updated_at', sql: "ALTER TABLE users ADD COLUMN profile_updated_at TIMESTAMP NULL" }
    ];

    for (const c of checks) {
      const exists = await columnExists(connection, c.name);
      if (!exists) {
        console.log(`- Adding column ${c.name}...`);
        await connection.query(c.sql);
      } else {
        console.log(`- Column ${c.name} already exists`);
      }
    }

    console.log('✅ Profile/KYC columns ensured');
  } catch (err) {
    console.error('❌ Failed to ensure columns:', err.message);
    process.exitCode = 1;
  } finally {
    connection.release();
  }
}

// Run when invoked directly
ensureColumns().then(() => process.exit());

import pool from '../config/database.js';

async function run() {
  const connection = await pool.getConnection();
  try {
    console.log('Starting migration: add_canonical_columns');

    // Add ticket_price column to fortune_draw_events if missing
    await connection.query(
      `ALTER TABLE fortune_draw_events
       ADD COLUMN IF NOT EXISTS ticket_price DECIMAL(10,2) DEFAULT NULL`
    ).catch(() => {});

    // If ticket_price is null, copy from amount
    await connection.query(
      `UPDATE fortune_draw_events SET ticket_price = amount WHERE ticket_price IS NULL AND amount IS NOT NULL`
    );

    // Make ticket_price NOT NULL with default 100.00 if currently NULL
    await connection.query(
      `ALTER TABLE fortune_draw_events MODIFY COLUMN ticket_price DECIMAL(10,2) NOT NULL DEFAULT 100.00`
    ).catch(() => {});

    // Add welcome_message column to home_settings if missing
    await connection.query(
      `ALTER TABLE home_settings
       ADD COLUMN IF NOT EXISTS welcome_message TEXT DEFAULT NULL`
    ).catch(() => {});

    // Copy welcome_text to welcome_message where welcome_message is NULL
    await connection.query(
      `UPDATE home_settings SET welcome_message = welcome_text WHERE welcome_message IS NULL AND welcome_text IS NOT NULL`
    );

    console.log('Migration completed successfully');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    connection.release();
    process.exit(0);
  }
}

run();

import pool from '../config/database.js';

async function describe() {
  try {
    const [fdCols] = await pool.query("DESCRIBE fortune_draw_events");
    console.log('fortune_draw_events columns:');
    console.table(fdCols);

    const [hsCols] = await pool.query("DESCRIBE home_settings");
    console.log('\nhome_settings columns:');
    console.table(hsCols);
  } catch (err) {
    console.error('Describe error:', err.message);
  } finally {
    process.exit(0);
  }
}

describe();

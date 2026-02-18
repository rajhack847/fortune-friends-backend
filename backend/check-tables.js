import pool from './config/database.js';

async function checkTables() {
  try {
    console.log('Checking database tables...\n');
    
    // Show all tables
    const [tables] = await pool.query('SHOW TABLES');
    console.log('Tables in database:');
    tables.forEach(t => console.log('-', Object.values(t)[0]));
    
    // Check for specific tables
    console.log('\nChecking specific tables:');
    const requiredTables = ['fortune_draw_events', 'home_settings'];
    
    for (const table of requiredTables) {
      try {
        const [rows] = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`✓ ${table} exists (${rows[0].count} rows)`);
      } catch (err) {
        console.log(`✗ ${table} does NOT exist`);
      }
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkTables();

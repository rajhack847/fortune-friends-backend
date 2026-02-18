import pool from './config/database.js';

async function check() {
  try {
    const [rows] = await pool.query('SELECT id, name, status, ticket_price FROM fortune_draw_events');
    console.log('\n📊 Fortune Draw Events in Database:');
    console.log(rows);
    
    if (rows.length === 0) {
      console.log('\n❌ No fortune draw events found! Running seed...\n');
      // Import and run seed
      const { default: seed } = await import('./database/seed.js');
    } else {
      console.log(`\n✅ Found ${rows.length} fortune draw event(s)`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

check();

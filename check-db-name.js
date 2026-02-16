import pool from './config/database.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkDatabase() {
  try {
    console.log('Environment DB_NAME:', process.env.DB_NAME);
    console.log('Fallback DB_NAME:', 'lottery_system');
    console.log('Actual DB_NAME used:', process.env.DB_NAME || 'lottery_system');
    
    const [result] = await pool.query('SELECT DATABASE() as current_db');
    console.log('\nActual connected database:', result[0].current_db);
    
    // Check if fortune_draw_system exists
    const [dbs] = await pool.query('SHOW DATABASES LIKE "fortune_draw_system"');
    console.log('\nfortune_draw_system exists:', dbs.length > 0);
    
    const [dbs2] = await pool.query('SHOW DATABASES LIKE "lottery_system"');
    console.log('lottery_system exists:', dbs2.length > 0);
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkDatabase();

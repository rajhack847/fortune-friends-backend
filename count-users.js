import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'fortune_draw_system',
  waitForConnections: true,
  connectionLimit: 10
});

async function countUsers() {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) as total FROM users');
    console.log(`\n📊 Total Users: ${rows[0].total}`);
    
    const [users] = await pool.query('SELECT * FROM users LIMIT 1');
    console.log('\n👥 Sample User Columns:');
    if (users.length > 0) {
      console.log(Object.keys(users[0]).join(', '));
      console.log('\n📄 First User:');
      console.log(users[0]);
    }
    
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

countUsers();

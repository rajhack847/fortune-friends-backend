import mysql from 'mysql2/promise';

async function checkUsers() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'fortune_draw_system'
    });

    const [rows] = await connection.query('SELECT COUNT(*) as total FROM users');
    console.log('\n✅ Total users in database:', rows[0].total);

    const [users] = await connection.query(`
      SELECT id, name, email, phone, is_blocked, 
             (SELECT COUNT(*) FROM tickets WHERE user_id = users.id) as ticket_count,
             created_at 
      FROM users 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    
    console.log('\n📋 First 10 users:');
    console.table(users);

    await connection.end();
  } catch (error) {
    console.error('❌ Database error:', error.message);
  }
}

checkUsers();

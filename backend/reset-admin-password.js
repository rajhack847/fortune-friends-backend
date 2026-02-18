import bcrypt from 'bcrypt';
import mysql from 'mysql2/promise';

async function resetPassword() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'lottery_system'
  });

  // New simple password
  const newPassword = 'admin123';
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await connection.execute(
    'UPDATE admins SET password_hash = ? WHERE username = ?',
    [hashedPassword, 'admin']
  );

  console.log('✅ Admin password updated successfully!');
  console.log('Username: admin');
  console.log('Password: admin123');

  await connection.end();
}

resetPassword().catch(console.error);

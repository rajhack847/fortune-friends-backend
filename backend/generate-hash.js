import bcrypt from 'bcryptjs';

async function generateHash() {
  const password = 'admin123';
  const hash = await bcrypt.hash(password, 10);
  
  console.log('\n═══════════════════════════════════════════════');
  console.log('CORRECT ADMIN PASSWORD HASH');
  console.log('═══════════════════════════════════════════════');
  console.log('Password:', password);
  console.log('Hash:', hash);
  console.log('\nVerification test:', await bcrypt.compare(password, hash));
  
  // Test the old hash from CREATE_ADMIN_USER.sql
  const oldHash = '$2b$10$rH5VqE.vT0Y8kXGx9ZBH4eF1jzx5q6YKX5nE0RH8CzZpP9VqE8YuK';
  const oldHashValid = await bcrypt.compare(password, oldHash);
  console.log('\nOld hash from SQL file valid?', oldHashValid);
  console.log('═══════════════════════════════════════════════\n');
  
  if (!oldHashValid) {
    console.log('ERROR: The hash in CREATE_ADMIN_USER.sql is WRONG!');
    console.log('USE THIS NEW HASH INSTEAD:\n');
    console.log(hash);
    console.log('\n');
  } else {
    console.log('✅ The hash in CREATE_ADMIN_USER.sql is CORRECT!\n');
  }
}

generateHash().catch(console.error);

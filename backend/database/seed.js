import bcrypt from 'bcryptjs';
import pool from '../config/database.js';

async function seed() {
  try {
    console.log('🌱 Seeding database...');
    
    const connection = await pool.getConnection();
    
    // Create default admin user
    const adminPassword = await bcrypt.hash(process.env.ADMIN_DEFAULT_PASSWORD || 'Admin@123', 10);
    await connection.query(
      `INSERT INTO admin_users (username, password_hash, role) 
       VALUES (?, ?, 'super_admin')
       ON DUPLICATE KEY UPDATE username=username`,
      [process.env.ADMIN_DEFAULT_USERNAME || 'admin', adminPassword]
    );
    
    // Create default Fortune Draw events for current year
    const currentYear = new Date().getFullYear();
    const drawDate = `${currentYear}-01-03`;
    const disclaimer = 'This is a fortune draw promotional activity. Winning depends on chance and participation level. No guaranteed winnings. By participating, you agree to the terms and conditions.';
    
    // Maruti Swift Dzire draw (₹100 tickets)
    await connection.query(
      `INSERT INTO fortune_draw_events (name, description, ticket_price, prize_type, prize_details, draw_date, status, disclaimer, registrations_open)
       VALUES (?, ?, ?, 'car', ?, ?, 'active', ?, TRUE)
       ON DUPLICATE KEY UPDATE ticket_price=VALUES(ticket_price), prize_type=VALUES(prize_type), prize_details=VALUES(prize_details)`,
      [
        `Win Maruti Swift Dzire ${currentYear}`,
        `Win a brand new Maruti Swift Dzire in our ${currentYear} draw!`,
        100.00,
        'Maruti Swift Dzire',
        drawDate,
        disclaimer
      ]
    );
    
    // Innova Crysta draw (₹500 tickets)
    await connection.query(
      `INSERT INTO fortune_draw_events (name, description, ticket_price, prize_type, prize_details, draw_date, status, disclaimer, registrations_open)
       VALUES (?, ?, ?, 'car', ?, ?, 'active', ?, TRUE)
       ON DUPLICATE KEY UPDATE ticket_price=VALUES(ticket_price), prize_type=VALUES(prize_type), prize_details=VALUES(prize_details)`,
      [
        `Win Innova Crysta ${currentYear}`,
        `Win a brand new Innova Crysta in our ${currentYear} draw!`,
        500.00,
        'Innova Crysta',
        drawDate,
        disclaimer
      ]
    );
    
    connection.release();
    console.log('✅ Database seeded successfully');
    console.log('   - Default admin created');
    console.log('   - Default Fortune Draw event created');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  }
}

seed();

import pool from '../config/database.js';

(async ()=>{
  try{
    console.log('Altering kyc_status enum to include submitted and pending_review...');
    await pool.query("ALTER TABLE users MODIFY COLUMN kyc_status ENUM('none','pending','submitted','pending_review','verified','rejected') DEFAULT 'none'");
    console.log('Alter complete');
    process.exit(0);
  }catch(e){
    console.error('ERROR', e.message);
    process.exit(1);
  }
})();

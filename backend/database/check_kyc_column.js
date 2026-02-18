import pool from '../config/database.js';

(async ()=>{
  try{
    const [rows] = await pool.query("SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'kyc_status'");
    console.log(rows);
    process.exit(0);
  }catch(e){
    console.error('ERR',e.message);
    process.exit(1);
  }
})();

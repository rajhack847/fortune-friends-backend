import pool from './config/database.js';

(async ()=>{
  try{
    const [cols] = await pool.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'");
    console.log('COLUMNS:', cols.map(c => c.COLUMN_NAME));
    const [rows]=await pool.query("SELECT id, user_id, name, kyc_status, kyc_document_url, kyc_document_front_url, kyc_document_back_url, kyc_document_pan_url FROM users WHERE kyc_status <> 'none' ORDER BY id DESC LIMIT 50");
    console.log(JSON.stringify(rows,null,2));
    process.exit(0);
  }catch(e){
    console.error('ERR',e.message);
    process.exit(1);
  }
})();

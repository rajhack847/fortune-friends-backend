import pool from '../config/database.js';

(async ()=>{
  try{
    const [rows]=await pool.query("SELECT id, name, kyc_status, kyc_submitted_at FROM users WHERE id IN (2,7) ORDER BY id");
    console.log(JSON.stringify(rows,null,2));
    process.exit(0);
  }catch(e){
    console.error('ERR',e.message);
    process.exit(1);
  }
})();

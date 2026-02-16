import pool from '../config/database.js';

(async ()=>{
  try{
    console.log('Running KYC status update...');
    const [result] = await pool.query(
      `UPDATE users SET kyc_status = 'submitted', kyc_submitted_at = NOW()
       WHERE (kyc_status IS NULL OR kyc_status = '' OR kyc_status = 'none')
         AND (
           kyc_document_url IS NOT NULL OR
           kyc_document_front_url IS NOT NULL OR
           kyc_document_back_url IS NOT NULL OR
           kyc_document_pan_url IS NOT NULL
         )`
    );
    console.log('OK, rows affected:', result.affectedRows);
    process.exit(0);
  }catch(e){
    console.error('ERROR', e.message);
    process.exit(1);
  }
})();

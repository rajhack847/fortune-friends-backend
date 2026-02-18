import db from '../config/database.js';

// Get payment settings
export const getPaymentSettings = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM payment_settings WHERE is_active = TRUE ORDER BY id DESC LIMIT 1'
    );
    
    if (rows.length === 0) {
      // Return default settings if none exist
      return res.json({
        success: true,
        data: {
          upi_id: 'fortunefriends@paytm',
          merchant_name: 'Fortune Friends',
          qr_code_url: null,
          instructions: '1. Open any UPI app (Google Pay, PhonePe, Paytm)\n2. Scan the QR code or use UPI ID\n3. Enter the exact amount\n4. Complete the payment\n5. Take a screenshot\n6. Upload it here',
          min_amount: 100,
          max_amount: 100000,
          is_active: true
        }
      });
    }
    
    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('Get payment settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment settings'
    });
  }
};

// Update payment settings (Admin only)
export const updatePaymentSettings = async (req, res) => {
  try {
    const { upi_id, merchant_name, qr_code_url, instructions, min_amount, max_amount } = req.body;
    const adminId = req.admin.id;
    
    // Validation
    if (!upi_id || !merchant_name) {
      return res.status(400).json({
        success: false,
        message: 'UPI ID and Merchant Name are required'
      });
    }
    
    // Check if settings exist
    const [existing] = await db.query('SELECT id FROM payment_settings LIMIT 1');
    
    if (existing.length > 0) {
      // Update existing
      await db.query(
        `UPDATE payment_settings 
         SET upi_id = ?, merchant_name = ?, qr_code_url = ?, instructions = ?, 
             min_amount = ?, max_amount = ?, updated_by = ?, updated_at = NOW()
         WHERE id = ?`,
        [upi_id, merchant_name, qr_code_url, instructions, min_amount, max_amount, adminId, existing[0].id]
      );
    } else {
      // Insert new
      await db.query(
        `INSERT INTO payment_settings 
         (upi_id, merchant_name, qr_code_url, instructions, min_amount, max_amount, updated_by, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
        [upi_id, merchant_name, qr_code_url, instructions, min_amount, max_amount, adminId]
      );
    }
    
    res.json({
      success: true,
      message: 'Payment settings updated successfully'
    });
  } catch (error) {
    console.error('Update payment settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update payment settings'
    });
  }
};

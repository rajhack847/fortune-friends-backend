import pool from '../config/database.js';
import { generatePaymentId, hashFile } from '../utils/generateCodes.js';
import crypto from 'crypto';

// Create Razorpay order (server-side)
export const createRazorpayOrder = async (req, res) => {
  try {
    const { amount, fortuneDrawEventId } = req.body;
    const userId = req.user.id;
    if (!amount || !fortuneDrawEventId) return res.status(400).json({ success: false, message: 'amount and fortuneDrawEventId required' });

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return res.status(500).json({ success: false, message: 'Razorpay keys not configured' });

    const orderBody = {
      amount: Math.round(Number(amount) * 100),
      currency: 'INR',
      receipt: generatePaymentId(),
      notes: {
        user_id: String(userId),
        fortune_draw_event_id: String(fortuneDrawEventId)
      }
    };

    const resp = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(keyId + ':' + keySecret).toString('base64')
      },
      body: JSON.stringify(orderBody)
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error('Razorpay create order failed', resp.status, txt);
      return res.status(502).json({ success: false, message: 'Razorpay order creation failed', detail: txt });
    }

    const data = await resp.json();
    return res.json({ success: true, data: { orderId: data.id, amount: data.amount, currency: data.currency, key: keyId } });
  } catch (error) {
    console.error('Create Razorpay order error:', error && (error.stack || error));
    res.status(500).json({ success: false, message: 'Failed to create order', error: error.message });
  }
};

// Confirm Razorpay payment (client calls after Checkout success)
export const confirmRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_payment_id } = req.body;
    if (!razorpay_payment_id) return res.status(400).json({ success: false, message: 'razorpay_payment_id required' });

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return res.status(500).json({ success: false, message: 'Razorpay keys not configured' });

    const resp = await fetch(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(keyId + ':' + keySecret).toString('base64')
      }
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error('Razorpay fetch payment failed', resp.status, txt);
      return res.status(502).json({ success: false, message: 'Failed to fetch payment from Razorpay', detail: txt });
    }

    const paymentEntity = await resp.json();
    if (paymentEntity.status !== 'captured' && paymentEntity.status !== 'authorized' && paymentEntity.status !== 'processed') {
      return res.status(400).json({ success: false, message: 'Payment not captured yet', status: paymentEntity.status });
    }

    // Use notes to associate with user/event
    const notes = paymentEntity.notes || {};
    const userId = notes.user_id ? parseInt(notes.user_id) : req.user.id;
    const fortuneDrawEventId = notes.fortune_draw_event_id ? parseInt(notes.fortune_draw_event_id) : null;
    const amount = (paymentEntity.amount || 0) / 100.0;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.query(
        `INSERT INTO payments (payment_id, user_id, fortune_draw_event_id, amount, status, created_at)
         VALUES (?, ?, ?, ?, 'approved', NOW())`,
        [paymentEntity.id, userId || null, fortuneDrawEventId || null, amount]
      );

      if (userId && fortuneDrawEventId) {
        const { generateTicketNumber } = await import('../utils/generateCodes.js');
        const ticketNumber = generateTicketNumber(fortuneDrawEventId);
        await connection.query(
          `INSERT INTO tickets (ticket_number, user_id, fortune_draw_event_id, payment_id, status, created_at)
           VALUES (?, ?, ?, ?, 'active', NOW())`,
          [ticketNumber, userId, fortuneDrawEventId, result.insertId]
        );
        await connection.query(
          `UPDATE referrals SET payment_status = 'paid', payment_id = ?, paid_at = NOW(), bonus_entries_awarded = 1
           WHERE referred_user_id = ? AND payment_status = 'pending'`,
          [result.insertId, userId]
        );
      }

      await connection.commit();
    } catch (e) {
      await connection.rollback();
      console.error('Failed to record razorpay confirm payment:', e && (e.stack || e));
      return res.status(500).json({ success: false, message: 'Failed to record payment' });
    } finally {
      connection.release();
    }

    return res.json({ success: true, message: 'Payment confirmed and recorded', data: { paymentId: paymentEntity.id } });
  } catch (error) {
    console.error('Confirm razorpay payment error:', error && (error.stack || error));
    res.status(500).json({ success: false, message: 'Failed to confirm payment', error: error.message });
  }
};

export const submitPayment = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const { fortuneDrawEventId, amount, upiTransactionId } = req.body;
    const userId = req.user.id;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ 
        success: false, 
        message: 'Payment screenshot is required' 
      });
    }
    
    if (!fortuneDrawEventId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Lottery event ID is required' 
      });
    }
    
    // Verify lottery event is active
    const [events] = await connection.query(
      'SELECT * FROM fortune_draw_events WHERE id = ? AND status = ? AND registrations_open = TRUE',
      [fortuneDrawEventId, 'active']
    );
    
    if (events.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Lottery event is not active or registrations are closed' 
      });
    }
    
    const event = events[0];
    const expectedAmount = parseFloat(amount) || event.ticket_price;
    
    await connection.beginTransaction();
    
    const paymentId = generatePaymentId();
    const screenshotUrl = `/uploads/payments/${file.filename}`;
    
    // Insert payment
    const [paymentResult] = await connection.query(
      `INSERT INTO payments (payment_id, user_id, fortune_draw_event_id, amount, screenshot_url, upi_transaction_id, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [paymentId, userId, fortuneDrawEventId, expectedAmount, screenshotUrl, upiTransactionId]
    );
    
    await connection.commit();
    
    res.status(201).json({
      success: true,
      message: 'Payment submitted successfully. Awaiting verification.',
      data: {
        paymentId,
        amount: expectedAmount,
        status: 'pending'
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Submit payment error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Payment submission failed',
      error: error.message 
    });
  } finally {
    connection.release();
  }
};

// Razorpay webhook handler
export const handleRazorpayWebhook = async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];
    if (!secret || !signature) {
      console.warn('Razorpay webhook received without secret or signature');
      return res.status(400).send('Missing signature or secret');
    }

    // req.body is raw buffer when route uses express.raw()
    const payload = req.body;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (expected !== signature) {
      console.warn('Razorpay webhook signature mismatch');
      return res.status(400).send('Invalid signature');
    }

    const event = JSON.parse(payload.toString('utf8'));
    const evName = event.event;

    // Only handle payment.captured events for now
    if (evName === 'payment.captured' || evName === 'payment.authorized') {
      const paymentEntity = event.payload?.payment?.entity;
      if (!paymentEntity) return res.status(200).send('no payment entity');

      const razorpayPaymentId = paymentEntity.id;
      const amount = (paymentEntity.amount || 0) / 100.0;
      const notes = paymentEntity.notes || {};

      // Try to associate with internal user and event via notes
      const userId = notes.user_id ? parseInt(notes.user_id) : null;
      const fortuneDrawEventId = notes.fortune_draw_event_id ? parseInt(notes.fortune_draw_event_id) : null;

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const paymentId = generatePaymentId();
        // Insert payment record; allow null user_id if not provided
        const [result] = await connection.query(
          `INSERT INTO payments (payment_id, user_id, fortune_draw_event_id, amount, status, created_at)
           VALUES (?, ?, ?, ?, 'approved', NOW())`,
          [razorpayPaymentId, userId || null, fortuneDrawEventId || null, amount]
        );

        // If we have a user and event, create ticket immediately
        if (userId && fortuneDrawEventId) {
          const { generateTicketNumber } = await import('../utils/generateCodes.js');
          const ticketNumber = generateTicketNumber(fortuneDrawEventId);
          await connection.query(
            `INSERT INTO tickets (ticket_number, user_id, fortune_draw_event_id, payment_id, status, created_at)
             VALUES (?, ?, ?, ?, 'active', NOW())`,
            [ticketNumber, userId, fortuneDrawEventId, result.insertId]
          );
          // Mark any referral as paid
          await connection.query(
            `UPDATE referrals SET payment_status = 'paid', payment_id = ?, paid_at = NOW(), bonus_entries_awarded = 1
             WHERE referred_user_id = ? AND payment_status = 'pending'`,
            [result.insertId, userId]
          );
        }

        await connection.commit();
      } catch (e) {
        await connection.rollback();
        console.error('Failed to record razorpay webhook payment:', e && (e.stack || e));
        return res.status(500).send('failed');
      } finally {
        connection.release();
      }
    }

    // Respond 200 to acknowledge
    res.status(200).send('ok');
  } catch (error) {
    console.error('Razorpay webhook handler error:', error && (error.stack || error));
    res.status(500).send('error');
  }
};
export const getUserPayments = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [payments] = await pool.query(
      `SELECT p.*, le.name as lottery_name, le.draw_date
       FROM payments p
       JOIN fortune_draw_events le ON p.fortune_draw_event_id = le.id
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC`,
      [userId]
    );
    
    res.json({
      success: true,
      data: payments
    });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch payments',
      error: error.message 
    });
  }
};

export const getPendingPayments = async (req, res) => {
  try {
    const [payments] = await pool.query(
      `SELECT p.*, u.name as user_name, u.mobile, u.email, u.user_id,
              le.name as lottery_name
       FROM payments p
       JOIN users u ON p.user_id = u.id
       JOIN fortune_draw_events le ON p.fortune_draw_event_id = le.id
       WHERE p.status = 'pending'
       ORDER BY p.created_at ASC`
    );
    
    res.json({
      success: true,
      data: payments
    });
  } catch (error) {
    console.error('Get pending payments error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch pending payments',
      error: error.message 
    });
  }
};

export const verifyPayment = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const { paymentId } = req.params;
    const { status, rejectionReason } = req.body;
    const adminId = req.admin.id;
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status. Must be approved or rejected' 
      });
    }
    
    if (status === 'rejected' && !rejectionReason) {
      return res.status(400).json({ 
        success: false, 
        message: 'Rejection reason is required' 
      });
    }
    
    await connection.beginTransaction();
    
    // Get payment details
    const [payments] = await connection.query(
      'SELECT * FROM payments WHERE id = ?',
      [paymentId]
    );
    
    if (payments.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Payment not found' 
      });
    }
    
    const payment = payments[0];
    
    if (payment.status !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: 'Payment has already been verified' 
      });
    }
    
    // Update payment status
    await connection.query(
      `UPDATE payments 
       SET status = ?, verified_by = ?, verified_at = NOW(), rejection_reason = ?
       WHERE id = ?`,
      [status, adminId, rejectionReason || null, paymentId]
    );
    
    // If approved, create ticket and update referral status
    if (status === 'approved') {
      const { generateTicketNumber } = await import('../utils/generateCodes.js');
      const ticketNumber = generateTicketNumber(payment.fortune_draw_event_id);
      
      await connection.query(
        `INSERT INTO tickets (ticket_number, user_id, fortune_draw_event_id, payment_id, status)
         VALUES (?, ?, ?, ?, 'active')`,
        [ticketNumber, payment.user_id, payment.fortune_draw_event_id, payment.id]
      );
      
      // Update referral if this user was referred
      await connection.query(
        `UPDATE referrals 
         SET payment_status = 'paid', payment_id = ?, paid_at = NOW(), bonus_entries_awarded = 1
         WHERE referred_user_id = ? AND payment_status = 'pending'`,
        [payment.id, payment.user_id]
      );
    }
    
    await connection.commit();
    
    res.json({
      success: true,
      message: `Payment ${status} successfully`,
      data: { paymentId, status }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Verify payment error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Payment verification failed',
      error: error.message 
    });
  } finally {
    connection.release();
  }
};

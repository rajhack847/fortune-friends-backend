import pool from '../config/database.js';
import fs from 'fs';
import path from 'path';

const _reqLogPath = path.join(process.cwd(), 'backend', 'logs', 'request-debug.log');
const _appendReqLog = (msg) => {
  try {
    fs.appendFileSync(_reqLogPath, `${new Date().toISOString()} ${msg}\n`);
  } catch (err) {
    console.error('Failed to write request-debug log:', err && (err.stack || err));
  }
};

export const getUserReferrals = async (req, res) => {
  try {
    if (!req.user) {
      _appendReqLog('[WARN] getUserReferrals called without authentication');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const userId = req.user.id;
    
    const [referrals] = await pool.query(
      `SELECT r.*, u.name, u.mobile, u.email, u.user_id as referred_user_id_string,
              p.amount, p.status as payment_verification_status
       FROM referrals r
       JOIN users u ON r.referred_user_id = u.id
       LEFT JOIN payments p ON r.payment_id = p.id
       WHERE r.referrer_id = ?
       ORDER BY r.created_at DESC`,
      [userId]
    );
    
    res.json({
      success: true,
      data: referrals
    });
  } catch (error) {
    console.error('Get referrals error:', error);
    _appendReqLog(`[ERROR] getUserReferrals error: ${error && (error.stack || error.message || String(error))}`);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch referrals',
      error: error.message 
    });
  }
};

export const getReferralStats = async (req, res) => {
  try {
    if (!req.user) {
      _appendReqLog('[WARN] getReferralStats called without authentication');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const userId = req.user.id;
    
    const [stats] = await pool.query(
      `SELECT 
        COUNT(*) as total_referrals,
        COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid_referrals,
        COUNT(CASE WHEN payment_status = 'pending' THEN 1 END) as pending_referrals,
        SUM(bonus_entries_awarded) as total_bonus_entries
       FROM referrals
       WHERE referrer_id = ?`,
      [userId]
    );
    
    res.json({
      success: true,
      data: stats[0]
    });
  } catch (error) {
    console.error('Get referral stats error:', error);
    _appendReqLog(`[ERROR] getReferralStats error: ${error && (error.stack || error.message || String(error))}`);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch referral statistics',
      error: error.message 
    });
  }
};

export const getReferralTree = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get direct referrals
    const [referrals] = await pool.query(
      `SELECT r.*, u.name, u.user_id, u.email, u.mobile,
              COUNT(DISTINCT t.id) as tickets_purchased,
              r.payment_status
       FROM referrals r
       JOIN users u ON r.referred_user_id = u.id
       LEFT JOIN tickets t ON u.id = t.user_id
       LEFT JOIN payments p ON t.payment_id = p.id AND p.status = 'approved'
       WHERE r.referrer_id = ?
       GROUP BY r.id, u.id`,
      [userId]
    );
    
    res.json({
      success: true,
      data: referrals
    });
  } catch (error) {
    console.error('Get referral tree error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch referral tree',
      error: error.message 
    });
  }
};

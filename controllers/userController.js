import path from 'path';
import fs from 'fs';
export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { address, pincode } = req.body;
    let profilePicUrl = null;

    // Log upload metadata if available
    try {
      const contentLength = req.headers['content-length'];
      const meta = { ts: new Date().toISOString(), userId, contentLength };
      if (req.files) {
        meta.files = Object.keys(req.files).reduce((acc, key) => {
          try { acc[key] = { size: req.files[key].size }; } catch(e){ acc[key] = { size: null }; }
          return acc;
        }, {});
      }
      const debugDir = path.join(process.cwd(), 'logs');
      if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
      fs.appendFileSync(path.join(debugDir, 'upload-meta.log'), JSON.stringify(meta) + '\n');
      // Also log files keys to console for live debugging
      try { console.log('updateUserProfile upload-meta files:', Object.keys(req.files || {})); } catch (e) {}
    } catch (e) {
      console.error('Failed to write upload meta log:', e.message);
    }

    // Handle profile picture upload
    if (req.files && req.files.profile_picture) {
      const file = req.files.profile_picture;
      const uploadPath = path.join('uploads', 'profiles', `${userId}_${Date.now()}_${file.name}`);
      await file.mv(uploadPath);
      profilePicUrl = '/' + uploadPath.replace(/\\/g, '/');
    }

    // Update user fields (address, pincode, profile_picture)
    let updateFields = [];
    let params = [];
    if (address !== undefined) {
      updateFields.push('`address` = ?');
      params.push(address);
    }
    if (pincode !== undefined) {
      updateFields.push('`pincode` = ?');
      params.push(pincode);
    }
    if (profilePicUrl) {
      updateFields.push('`profile_picture_url` = ?');
      params.push(profilePicUrl);
    }
    if (updateFields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }
    params.push(userId);
    const sql = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
    console.log('DEBUG updateUserProfile SQL:', sql);
    console.log('DEBUG updateUserProfile PARAMS:', params);
    try {
      // write debug info to file for offline inspection (use process.cwd() to avoid __dirname issues)
      const debugDir = path.join(process.cwd(), 'logs');
      if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
      const debugFile = path.join(debugDir, 'profile-debug.log');
      const entry = { ts: new Date().toISOString(), sql, params };
      fs.appendFileSync(debugFile, JSON.stringify(entry) + '\n');
    } catch (e) {
      console.error('Failed to write debug log:', e.message);
    }
    await pool.query(sql, params);
    // Return updated user row so frontend can refresh avatar
    try {
      const [userRows] = await pool.query(
        'SELECT id, user_id, name, mobile, email, profile_picture_url, address, pincode FROM users WHERE id = ?',
        [userId]
      );
      const updatedUser = userRows.length ? userRows[0] : null;
      return res.json({ success: true, message: 'Profile updated successfully', data: updatedUser });
    } catch (e) {
      console.error('Failed to fetch updated user after profile update:', e.message);
      return res.json({ success: true, message: 'Profile updated successfully' });
    }
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile', error: error.message });
  }
};
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import { 
  generateUserId, 
  generateReferralCode, 
  generateReferralLink 
} from '../utils/generateCodes.js';

export const registerUser = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const { name, mobile, email, referralCode, password } = req.body;
    
    // Validate required fields
    if (!name || !mobile || !email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, mobile, and email are required' 
      });
    }
    
    // Check if user already exists
    const [existing] = await connection.query(
      'SELECT * FROM users WHERE mobile = ? OR email = ?',
      [mobile, email]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'User with this mobile or email already exists' 
      });
    }
    
    await connection.beginTransaction();
    
    // Generate unique codes
    let userId, userReferralCode, isUnique = false;
    
    while (!isUnique) {
      userId = generateUserId();
      userReferralCode = generateReferralCode();
      
      const [duplicate] = await connection.query(
        'SELECT * FROM users WHERE user_id = ? OR referral_code = ?',
        [userId, userReferralCode]
      );
      
      if (duplicate.length === 0) {
        isUnique = true;
      }
    }
    
    const referralLink = generateReferralLink(userReferralCode);
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    
    // Insert user
    const [result] = await connection.query(
      `INSERT INTO users (user_id, name, mobile, email, referral_code, referral_link, password_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, name, mobile, email, userReferralCode, referralLink, passwordHash]
    );
    
    const newUserId = result.insertId;
    
    // If user was referred, create referral record
    if (referralCode) {
      const [referrer] = await connection.query(
        'SELECT id FROM users WHERE referral_code = ?',
        [referralCode]
      );
      
      if (referrer.length > 0) {
        await connection.query(
          `INSERT INTO referrals (referrer_id, referred_user_id, payment_status)
           VALUES (?, ?, 'pending')`,
          [referrer[0].id, newUserId]
        );
      }
    }
    
    await connection.commit();
    
    // Generate token
    const token = jwt.sign(
      { userId: newUserId, type: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        id: newUserId,
        userId,
        name,
        mobile,
        email,
        referralCode: userReferralCode,
        referralLink,
        token
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Registration failed',
      error: error.message 
    });
  } finally {
    connection.release();
  }
};

export const loginUser = async (req, res) => {
  try {
    const { mobile, password } = req.body;
    
    if (!mobile) {
      return res.status(400).json({ 
        success: false, 
        message: 'Mobile number is required' 
      });
    }
    
    const [users] = await pool.query(
      'SELECT * FROM users WHERE mobile = ? AND is_active = TRUE',
      [mobile]
    );
    
    if (users.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }
    
    const user = users[0];
    
    // If password is set, verify it
    if (user.password_hash) {
      if (!password) {
        return res.status(400).json({ 
          success: false, 
          message: 'Password is required' 
        });
      }
      
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid credentials' 
        });
      }
    }
    
    const token = jwt.sign(
      { userId: user.id, type: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        id: user.id,
        userId: user.user_id,
        name: user.name,
        mobile: user.mobile,
        email: user.email,
        referralCode: user.referral_code,
        referralLink: user.referral_link,
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Login failed',
      error: error.message 
    });
  }
};

export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [users] = await pool.query(
      'SELECT id, user_id, name, email, mobile, address, pincode, profile_picture_url, referral_code, referral_link, created_at FROM users WHERE id = ?',
      [userId]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    res.json({
      success: true,
      data: users[0]
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch profile',
      error: error.message 
    });
  }
};

export const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ success: false, message: 'New password is required' });

    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

    const user = rows[0];
    if (user.password_hash) {
      if (!currentPassword) return res.status(400).json({ success: false, message: 'Current password is required' });
      const ok = await bcrypt.compare(currentPassword, user.password_hash);
      if (!ok) return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hashed, userId]);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Failed to change password', error: error.message });
  }
};

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import { generateReferralLink } from '../utils/generateCodes.js';

export const adminLogin = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password are required' 
      });
    }
    
    const [admins] = await pool.query(
      'SELECT * FROM admin_users WHERE username = ? AND is_active = TRUE',
      [username]
    );
    
    if (admins.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }
    
    const admin = admins[0];
    const isValidPassword = await bcrypt.compare(password, admin.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }
    
    // Update last login
    await pool.query(
      'UPDATE admin_users SET last_login = NOW() WHERE id = ?',
      [admin.id]
    );
    
    const jwtSecret = process.env.JWT_SECRET || 'dev_fortune_friends_jwt_secret';
    if (!process.env.JWT_SECRET) {
      console.warn('WARNING: JWT_SECRET is not set in environment. Using development fallback secret. Set JWT_SECRET in backend/.env for production.');
    }
    const token = jwt.sign(
      { adminId: admin.id, role: admin.role, type: 'admin' },
      jwtSecret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        id: admin.id,
        username: admin.username,
        role: admin.role,
        token
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Login failed',
      error: error.message 
    });
  }
};

export const createLotteryEvent = async (req, res) => {
  try {
    const { name, description, ticketPrice, prizeType, prizeAmount, prizeDetails, drawDate, disclaimer } = req.body;
    
    if (!name || !drawDate) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name and draw date are required' 
      });
    }

    // Validate prize type
    const type = prizeType || 'cash';
    if (!['cash', 'car'].includes(type)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Prize type must be either "cash" or "car"' 
      });
    }

    // Validate prize data based on type
    if (type === 'cash' && !prizeAmount) {
      return res.status(400).json({ 
        success: false, 
        message: 'Prize amount is required for cash prizes' 
      });
    }

    if (type === 'car' && !prizeDetails) {
      return res.status(400).json({ 
        success: false, 
        message: 'Prize details (car model) is required for car prizes' 
      });
    }

    // Get image filename if uploaded
    const imageName = req.file ? req.file.filename : null;
    
    const [result] = await pool.query(
      `INSERT INTO fortune_draw_events (name, description, ticket_price, prize_type, prize_amount, prize_details, draw_date, disclaimer, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
      [
        name, 
        description, 
        ticketPrice || 100, 
        type,
        type === 'cash' ? prizeAmount : null,
        type === 'car' ? prizeDetails : null,
        drawDate, 
        disclaimer
      ]
    );
    
    res.status(201).json({
      success: true,
      message: 'Lottery event created successfully',
      data: { id: result.insertId, imageName }
    });
  } catch (error) {
    console.error('Create lottery error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create lottery event',
      error: error.message 
    });
  }
};

export const listKycSubmissions = async (req, res) => {
  try {
    // Include referrer/initiator information if available so admin can see who referred the user
    // Include users where KYC status indicates submission OR where any KYC document URL is present
    const [rows] = await pool.query(
            `SELECT u.id, u.user_id, u.name, u.email, u.mobile AS phone, u.profile_picture_url,
              u.kyc_document_url, u.kyc_document_front_url, u.kyc_document_back_url, u.kyc_document_pan_url, u.kyc_status, u.kyc_submitted_at,
              r.referrer_id, ref.name AS referrer_name, ref.email AS referrer_email
       FROM users u
       LEFT JOIN referrals r ON r.referred_user_id = u.id
       LEFT JOIN users ref ON ref.id = r.referrer_id
       WHERE (
         u.kyc_status IN ('pending','submitted','pending_review')
         OR u.kyc_document_url IS NOT NULL
         OR u.kyc_document_front_url IS NOT NULL
         OR u.kyc_document_back_url IS NOT NULL
         OR u.kyc_document_pan_url IS NOT NULL
       )
       ORDER BY u.id DESC`
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('List KYC error:', error);
    res.status(500).json({ success: false, message: 'Failed to list KYC submissions' });
  }
};

export const updateUserKycStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    if (!['verified', 'rejected', 'pending', 'submitted', 'pending_review'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const updates = ['kyc_status = ?'];
    const params = [status];
    if (status === 'rejected') {
      updates.push('kyc_rejection_reason = ?');
      params.push(reason || null);
    } else if (status === 'verified') {
      updates.push('kyc_rejection_reason = NULL');
      // mark kyc_verified_at if desired
      updates.push('kyc_verified_at = NOW()');
    }
    params.push(id);

    // Update user KYC status
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    // When KYC is verified, mark referrals for this referred user as 'paid' so they count towards referrer totals
    if (status === 'verified') {
      try {
        const [result] = await pool.query(
          `UPDATE referrals SET payment_status = 'paid', counted_at = NOW() WHERE referred_user_id = ? AND payment_status != 'paid'`,
          [id]
        );
        // optionally, you could log result.affectedRows
      } catch (e) {
        console.error('Failed to mark referrals as paid for user', id, e.message);
      }
    }

    res.json({ success: true, message: 'KYC status updated' });
  } catch (error) {
    console.error('Update KYC status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update KYC status' });
  }
};

export const updateLotteryEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, ticketPrice, prizeType, prizeAmount, prizeDetails, drawDate, status, registrationsOpen, disclaimer } = req.body;
    
    const updates = [];
    const values = [];
    
    if (name) {
      updates.push('name = ?');
      values.push(name);
    }

    
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (ticketPrice) {
      updates.push('ticket_price = ?');
      values.push(ticketPrice);
    }
    if (prizeType) {
      if (!['cash', 'car'].includes(prizeType)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Prize type must be either "cash" or "car"' 
        });
      }
      updates.push('prize_type = ?');
      values.push(prizeType);
      
      // Handle prize fields based on type
      if (prizeType === 'cash') {
        if (prizeAmount) {
          updates.push('prize_amount = ?');
          values.push(prizeAmount);
        }
        // Clear car details when switching to cash
        updates.push('prize_details = NULL');
      } else if (prizeType === 'car') {
        if (prizeDetails) {
          updates.push('prize_details = ?');
          values.push(prizeDetails);
        }
        // Clear cash amount when switching to car
        updates.push('prize_amount = NULL');
      }
    } else {
      // If prize type not changing, update amount/details independently
      if (prizeAmount !== undefined) {
        updates.push('prize_amount = ?');
        values.push(prizeAmount);
      }
      if (prizeDetails !== undefined) {
        updates.push('prize_details = ?');
        values.push(prizeDetails);
      }
    }
    if (drawDate) {
      updates.push('draw_date = ?');
      values.push(drawDate);
    }
    if (status) {
      updates.push('status = ?');
      values.push(status);
    }
    if (registrationsOpen !== undefined) {
      updates.push('registrations_open = ?');
      values.push(registrationsOpen);
    }
    if (disclaimer !== undefined) {
      updates.push('disclaimer = ?');
      values.push(disclaimer);
    }
    
    if (updates.length === 0 && !req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No fields to update' 
      });
    }
    
    values.push(id);
    
    if (updates.length > 0) {
      await pool.query(
        `UPDATE fortune_draw_events SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }
    
    const imageName = req.file ? req.file.filename : null;
    
    res.json({
      success: true,
      message: 'Lottery event updated successfully',
      data: { id, imageName }
    });
  } catch (error) {
    console.error('Update lottery error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update lottery event',
      error: error.message 
    });
  }
};

  // Admin accounts management
  export const getAdminAccounts = async (req, res) => {
    try {
      let rows;
      try {
        const result = await pool.query('SELECT id, username, role, email, is_active, last_login, permissions FROM admin_users ORDER BY id ASC');
        rows = result[0];
      } catch (e) {
        // If permissions or email columns don't exist, fall back to selecting only known columns
        if (e && e.code === 'ER_BAD_FIELD_ERROR') {
          // select without email and permissions
          const result = await pool.query('SELECT id, username, role, is_active, last_login FROM admin_users ORDER BY id ASC');
          rows = result[0];
          // normalize shape to include email and permissions keys
          rows = rows.map(r => ({ ...r, email: null, permissions: null }));
        } else {
          throw e;
        }
      }
      // parse permissions JSON if present
      const parsed = rows.map((r) => ({
        ...r,
        permissions: r.permissions ? (() => {
          try { return JSON.parse(r.permissions); } catch (e) { return null; }
        })() : []
      }));
      res.json({ success: true, data: parsed });
    } catch (error) {
      console.error('Get admin accounts error:', error && (error.stack || error));
      const payload = { success: false, message: 'Failed to load admin accounts' };
      if (process.env.NODE_ENV === 'development') payload.error = error && (error.message || String(error));
      return res.status(500).json(payload);
    }
  };

  export const createAdminAccount = async (req, res) => {
    try {
      const { username, password, role, email, permissions } = req.body;
      if (!username || !password || !role) {
        return res.status(400).json({ success: false, message: 'username, password and role are required' });
      }
      // check existing
      const [existing] = await pool.query('SELECT id FROM admin_users WHERE username = ?', [username]);
      if (existing.length > 0) {
        return res.status(409).json({ success: false, message: 'Username already exists' });
      }
      const hashed = await bcrypt.hash(password, 10);
      const permString = permissions && Array.isArray(permissions) ? JSON.stringify(permissions) : null;
      try {
        const [result] = await pool.query('INSERT INTO admin_users (username, password_hash, role, email, is_active, permissions) VALUES (?, ?, ?, ?, TRUE, ?)', [username, hashed, role, email || null, permString]);
        return res.status(201).json({ success: true, message: 'Admin account created', data: { id: result.insertId, username, role, email, permissions: permissions || [] } });
      } catch (e) {
        // If DB lacks email and/or permissions columns, retry with minimal columns
        if (e && e.code === 'ER_BAD_FIELD_ERROR') {
          // Try minimal insert: username, password_hash, role, is_active
          const [result] = await pool.query('INSERT INTO admin_users (username, password_hash, role, is_active) VALUES (?, ?, ?, TRUE)', [username, hashed, role]);
          return res.status(201).json({ success: true, message: 'Admin account created', data: { id: result.insertId, username, role, email: null, permissions: [] } });
        }
        throw e;
      }
    } catch (error) {
      console.error('Create admin error:', error && (error.stack || error));
      const payload = { success: false, message: 'Failed to create admin' };
      if (process.env.NODE_ENV === 'development') payload.error = error && (error.message || String(error));
      return res.status(500).json(payload);
    }
  };

  export const updateAdminAccount = async (req, res) => {
    try {
      const { id } = req.params;
      const { role, is_active, email, permissions } = req.body;
      const updates = [];
      const params = [];
      if (role) {
        updates.push('role = ?'); params.push(role);
      }
      if (typeof is_active !== 'undefined') {
        updates.push('is_active = ?'); params.push(is_active ? 1 : 0);
      }
      if (typeof email !== 'undefined') {
        updates.push('email = ?'); params.push(email || null);
      }
      if (typeof permissions !== 'undefined') {
        // Expect permissions to be an array; store JSON string
        const permString = permissions ? JSON.stringify(permissions) : null;
        updates.push('permissions = ?'); params.push(permString);
      }
      if (updates.length === 0) return res.status(400).json({ success: false, message: 'No updates provided' });
      params.push(id);
      try {
        await pool.query(`UPDATE admin_users SET ${updates.join(', ')} WHERE id = ?`, params);
      } catch (e) {
        // If DB is missing the `permissions` column, try to add it and retry once
        if (e && e.code === 'ER_BAD_FIELD_ERROR' && String(e.message).toLowerCase().includes('permissions')) {
          try {
            console.warn('permissions column missing in admin_users, attempting to add column');
            await pool.query("ALTER TABLE admin_users ADD COLUMN permissions TEXT NULL");
            // retry update
            await pool.query(`UPDATE admin_users SET ${updates.join(', ')} WHERE id = ?`, params);
          } catch (inner) {
            console.error('Failed to add permissions column or retry update:', inner && (inner.stack || inner));
            throw inner;
          }
        } else {
          throw e;
        }
      }
      res.json({ success: true, message: 'Admin account updated' });
    } catch (error) {
      console.error('Update admin error:', error && (error.stack || error));
      const payload = { success: false, message: 'Failed to update admin' };
      if (process.env.NODE_ENV === 'development') payload.error = error && (error.message || String(error));
      return res.status(500).json(payload);
    }
  };

  // Return static list of available permissions
  export const getAvailablePermissions = async (req, res) => {
    try {
      // Standardized permission keys used across admin UI
      const perms = [
        'dashboard',
        'users',
        'fortune_draw_events',
        'payment_verification',
        'winners',
        'chat_management',
        'payment_settings',
        'home_settings',
        'admin_settings',
        'kyc_review'
      ];
      res.json({ success: true, data: perms });
    } catch (error) {
      console.error('Get permissions error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch permissions' });
    }
  };

  // Return role -> permissions mapping for UI convenience
  export const getRolePermissions = async (req, res) => {
    try {
      const perms = [
        'dashboard',
        'users',
        'fortune_draw_events',
        'payment_verification',
        'winners',
        'chat_management',
        'payment_settings',
        'home_settings',
        'admin_settings',
        'kyc_review'
      ];

      // Default role assignments (can be adjusted later)
      const roles = {
        super_admin: perms.slice(),
        admin: perms.filter(p => p !== 'admin_settings'),
        verifier: ['kyc_review', 'payment_verification']
      };

      res.json({ success: true, data: { permissions: perms, roles } });
    } catch (error) {
      console.error('Get role permissions error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch role permissions' });
    }
  };

  export const deleteAdminAccount = async (req, res) => {
    try {
      const { id } = req.params;
      // Soft-delete: mark inactive
      await pool.query('UPDATE admin_users SET is_active = FALSE WHERE id = ?', [id]);
      res.json({ success: true, message: 'Admin account disabled' });
    } catch (error) {
      console.error('Delete admin error:', error);
      res.status(500).json({ success: false, message: 'Failed to delete admin' });
    }
  };

  export const changeMyPassword = async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) return res.status(400).json({ success: false, message: 'Both current and new password required' });
      const admin = req.admin;
      const valid = await bcrypt.compare(currentPassword, admin.password_hash);
      if (!valid) return res.status(401).json({ success: false, message: 'Current password is incorrect' });
      const hashed = await bcrypt.hash(newPassword, 10);
      await pool.query('UPDATE admin_users SET password_hash = ? WHERE id = ?', [hashed, admin.id]);
      res.json({ success: true, message: 'Password changed' });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ success: false, message: 'Failed to change password' });
    }
  };

export const getAllLotteryEvents = async (req, res) => {
  try {
    const [events] = await pool.query(
      'SELECT * FROM fortune_draw_statistics ORDER BY draw_date DESC'
    );
    
    res.json({
      success: true,
      data: events
    });
  } catch (error) {
    console.error('Get all lotteries error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch lottery events',
      error: error.message 
    });
  }
};

export const markPrizeDelivered = async (req, res) => {
  try {
    const { winnerId } = req.params;
    const { deliveryNotes } = req.body;
    
    await pool.query(
      'UPDATE winners SET prize_delivered = TRUE, delivered_at = NOW(), delivery_notes = ? WHERE id = ?',
      [deliveryNotes || null, winnerId]
    );
    
    res.json({
      success: true,
      message: 'Prize marked as delivered',
      data: { winnerId }
    });
  } catch (error) {
    console.error('Mark prize delivered error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update prize delivery status',
      error: error.message 
    });
  }
};

export const getDashboardStats = async (req, res) => {
  try {
    const [stats] = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE is_active = TRUE) as total_users,
        (SELECT COUNT(*) FROM fortune_draw_events WHERE status = 'active') as active_lotteries,
        (SELECT COUNT(*) FROM payments WHERE status = 'pending') as pending_payments,
        (SELECT COUNT(*) FROM tickets) as total_tickets,
        (SELECT COUNT(*) FROM referrals WHERE payment_status = 'paid') as successful_referrals,
        (SELECT SUM(prize_amount) FROM winners WHERE prize_delivered = FALSE) as pending_prizes
    `);
    
    res.json({
      success: true,
      data: stats[0]
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch dashboard statistics',
      error: error.message 
    });
  }
};

// Get top referrers (by number of successful referrals)
export const getTopReferrers = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;

    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.referral_code, COUNT(r.id) AS referrals_count
       FROM users u
       LEFT JOIN referrals r ON r.referrer_id = u.id AND r.payment_status = 'paid'
       GROUP BY u.id, u.name, u.email, u.referral_code
       ORDER BY referrals_count DESC
       LIMIT ?`,
      [limit]
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Get top referrers error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch top referrers' });
  }
};

// ===== USER MANAGEMENT =====

// Get all users with filters
export const getAllUsers = async (req, res) => {
  try {
    const { search, status, sortBy = 'created_at', order = 'DESC' } = req.query;
    
    let query = `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.mobile,
        u.referral_code,
        u.is_active,
        u.created_at,
        COUNT(DISTINCT t.id) as total_tickets,
        COUNT(DISTINCT p.id) as total_payments,
        SUM(p.amount) as total_spent
      FROM users u
      LEFT JOIN tickets t ON u.id = t.user_id
      LEFT JOIN payments p ON u.id = p.user_id AND p.status = 'VERIFIED'
    `;
    
    const params = [];
    const conditions = [];
    
    if (search) {
      conditions.push('(u.name LIKE ? OR u.email LIKE ? OR u.mobile LIKE ? OR u.referral_code LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    if (status) {
      conditions.push('u.is_active = ?');
      params.push(status === 'active' ? 1 : 0);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ` GROUP BY u.id, u.name, u.email, u.mobile, u.referral_code, u.is_active, u.created_at ORDER BY ${sortBy} ${order}`;
    
    const [users] = await pool.query(query, params);
    
    res.json({
      success: true,
      users,
      total: users.length
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch users',
      error: error.message 
    });
  }
};

// Get single user details
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [users] = await pool.query(
      `SELECT 
        u.*,
        (SELECT COUNT(*) FROM tickets WHERE user_id = u.id) as total_tickets,
        (SELECT COUNT(*) FROM referrals WHERE referrer_id = u.id) as total_referrals
      FROM users u WHERE u.id = ?`,
      [id]
    );
    
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      user: users[0]
    });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch user',
      error: error.message 
    });
  }
};

// Dev-only: get limited public user info (no auth) for local testing
export const getUserPublic = async (req, res) => {
  try {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    const { id } = req.params;
    const [users] = await pool.query(
      `SELECT 
        u.id,
        u.name,
        u.email,
        u.mobile,
        u.referral_code,
        u.profile_picture_url,
        (SELECT COUNT(*) FROM tickets WHERE user_id = u.id) as total_tickets,
        (SELECT COUNT(*) FROM referrals WHERE referrer_id = u.id) as total_referrals
      FROM users u WHERE u.id = ?`,
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user: users[0] });
  } catch (error) {
    console.error('Get public user error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user' });
  }
};

// Create new user
export const createUser = async (req, res) => {
  try {
    const { name, email, mobile, password } = req.body;
    
    // Validate input
    if (!name || !email || !mobile || !password) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }
    
    // Check if email already exists
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ? OR mobile = ?',
      [email, mobile]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Email or mobile already exists'
      });
    }
    
    // Generate unique user_id and referral code
    const userId = `FF${Date.now().toString(36).toUpperCase().substring(0, 8)}`;
    const referralCode = `REF${Date.now().toString(36).toUpperCase()}`;
    const referralLink = generateReferralLink(referralCode);
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insert user
    const [result] = await pool.query(
      `INSERT INTO users (user_id, name, email, mobile, password_hash, referral_code, referral_link, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [userId, name, email, mobile, hashedPassword, referralCode, referralLink]
    );
    
    res.json({
      success: true,
      message: 'User created successfully',
      userId: result.insertId
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create user',
      error: error.message 
    });
  }
};

// Update user
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, mobile, password } = req.body;
    
    // Check if user exists
    const [users] = await pool.query('SELECT id FROM users WHERE id = ?', [id]);
    
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Build update query
    const updates = [];
    const params = [];
    
    if (name) {
      updates.push('name = ?');
      params.push(name);
    }
    
    if (email) {
      // Check if email is taken by another user
      const [existing] = await pool.query(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email, id]
      );
      
      if (existing.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists'
        });
      }
      
      updates.push('email = ?');
      params.push(email);
    }
    
    if (mobile) {
      // Check if mobile is taken by another user
      const [existingMobile] = await pool.query(
        'SELECT id FROM users WHERE mobile = ? AND id != ?',
        [mobile, id]
      );
      
      if (existingMobile.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Mobile number already exists'
        });
      }
      
      updates.push('mobile = ?');
      params.push(mobile);
    }
    
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push('password_hash = ?');
      params.push(hashedPassword);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }
    
    params.push(id);
    
    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    
    res.json({
      success: true,
      message: 'User updated successfully'
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update user',
      error: error.message 
    });
  }
};

// Block/Unblock user
export const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'block' or 'unblock'
    
    const [users] = await pool.query('SELECT id, is_active FROM users WHERE id = ?', [id]);
    
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const newStatus = action === 'block' ? 0 : 1;
    
    await pool.query(
      'UPDATE users SET is_active = ? WHERE id = ?',
      [newStatus, id]
    );
    
    res.json({
      success: true,
      message: `User ${action === 'block' ? 'blocked' : 'unblocked'} successfully`
    });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update user status',
      error: error.message 
    });
  }
};

// Delete user
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [users] = await pool.query('SELECT id FROM users WHERE id = ?', [id]);
    
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Delete user (cascading will handle related records)
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete user',
      error: error.message 
    });
  }
};

import pool from '../config/database.js';

// Ensure wallet exists for a user (creates if not)
export const ensureWallet = async (connection, userId) => {
  const [wallets] = await connection.query(
    'SELECT * FROM wallets WHERE user_id = ?', [userId]
  );
  if (wallets.length > 0) return wallets[0];

  const [result] = await connection.query(
    'INSERT INTO wallets (user_id, coin_balance, total_earned, total_withdrawn) VALUES (?, 0, 0, 0)',
    [userId]
  );
  return { id: result.insertId, user_id: userId, coin_balance: 0, total_earned: 0, total_withdrawn: 0 };
};

// Credit coins to a user wallet
export const creditCoins = async (connection, userId, amount, type, description, referenceId = null) => {
  const wallet = await ensureWallet(connection, userId);
  const newBalance = parseFloat(wallet.coin_balance) + parseFloat(amount);

  await connection.query(
    'UPDATE wallets SET coin_balance = ?, total_earned = total_earned + ? WHERE id = ?',
    [newBalance, amount, wallet.id]
  );

  await connection.query(
    `INSERT INTO wallet_transactions (wallet_id, user_id, type, amount, balance_after, description, reference_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [wallet.id, userId, type, amount, newBalance, description, referenceId]
  );

  return newBalance;
};

// Debit coins from a user wallet
export const debitCoins = async (connection, userId, amount, type, description, referenceId = null) => {
  const wallet = await ensureWallet(connection, userId);
  const currentBalance = parseFloat(wallet.coin_balance);

  if (currentBalance < amount) {
    throw new Error('Insufficient coin balance');
  }

  const newBalance = currentBalance - amount;

  await connection.query(
    'UPDATE wallets SET coin_balance = ?, total_withdrawn = total_withdrawn + ? WHERE id = ?',
    [newBalance, amount, wallet.id]
  );

  await connection.query(
    `INSERT INTO wallet_transactions (wallet_id, user_id, type, amount, balance_after, description, reference_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [wallet.id, userId, type, -amount, newBalance, description, referenceId]
  );

  return newBalance;
};

// GET /api/wallet - Get user wallet info
export const getWallet = async (req, res) => {
  try {
    const userId = req.user.id;
    const connection = await pool.getConnection();
    try {
      const wallet = await ensureWallet(connection, userId);
      res.json({ success: true, data: wallet });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch wallet' });
  }
};

// GET /api/wallet/transactions - Get wallet transaction history
export const getWalletTransactions = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const [transactions] = await pool.query(
      `SELECT wt.*, w.coin_balance as current_balance
       FROM wallet_transactions wt
       JOIN wallets w ON wt.wallet_id = w.id
       WHERE wt.user_id = ?
       ORDER BY wt.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM wallet_transactions WHERE user_id = ?',
      [userId]
    );

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          page,
          limit,
          total: countResult[0].total,
          totalPages: Math.ceil(countResult[0].total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get wallet transactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
};

// POST /api/wallet/withdraw - Request withdrawal
export const requestWithdrawal = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user.id;
    const { amount, upiId, bankName, accountNumber, ifscCode, accountHolderName } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid withdrawal amount is required' });
    }

    // At least one payment method required
    if (!upiId && !accountNumber) {
      return res.status(400).json({ success: false, message: 'UPI ID or bank account details are required' });
    }

    // Get system settings for min/max withdrawal
    const [settings] = await connection.query(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('min_withdrawal', 'max_withdrawal')"
    );
    const settingsMap = {};
    settings.forEach(s => { settingsMap[s.setting_key] = parseFloat(s.setting_value); });
    const minWithdrawal = settingsMap.min_withdrawal || 100;
    const maxWithdrawal = settingsMap.max_withdrawal || 10000;

    if (amount < minWithdrawal) {
      return res.status(400).json({ success: false, message: `Minimum withdrawal is ${minWithdrawal} coins` });
    }
    if (amount > maxWithdrawal) {
      return res.status(400).json({ success: false, message: `Maximum withdrawal is ${maxWithdrawal} coins` });
    }

    // Check for pending withdrawals
    const [pendingCheck] = await connection.query(
      "SELECT COUNT(*) as pending FROM withdrawal_requests WHERE user_id = ? AND status = 'pending'",
      [userId]
    );
    if (pendingCheck[0].pending > 0) {
      return res.status(400).json({ success: false, message: 'You already have a pending withdrawal request' });
    }

    await connection.beginTransaction();

    // Debit wallet
    const wallet = await ensureWallet(connection, userId);
    if (parseFloat(wallet.coin_balance) < amount) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Insufficient coin balance' });
    }

    const newBalance = await debitCoins(connection, userId, amount, 'withdrawal', 'Withdrawal request');

    // Create withdrawal request
    const [result] = await connection.query(
      `INSERT INTO withdrawal_requests (user_id, wallet_id, amount, upi_id, bank_name, account_number, ifsc_code, account_holder_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, wallet.id, amount, upiId || null, bankName || null, accountNumber || null, ifscCode || null, accountHolderName || null]
    );

    // Update the transaction reference_id to point to this withdrawal
    await connection.query(
      `UPDATE wallet_transactions SET reference_id = ? WHERE wallet_id = ? AND type = 'withdrawal' ORDER BY id DESC LIMIT 1`,
      [result.insertId, wallet.id]
    );

    await connection.commit();

    res.json({
      success: true,
      message: 'Withdrawal request submitted successfully',
      data: { withdrawalId: result.insertId, amount, newBalance }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Request withdrawal error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit withdrawal request' });
  } finally {
    connection.release();
  }
};

// GET /api/wallet/withdrawals - Get user's withdrawal history
export const getMyWithdrawals = async (req, res) => {
  try {
    const userId = req.user.id;
    const [withdrawals] = await pool.query(
      `SELECT * FROM withdrawal_requests WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );
    res.json({ success: true, data: withdrawals });
  } catch (error) {
    console.error('Get withdrawals error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch withdrawals' });
  }
};

// GET /api/wallet/settings - Get withdrawal limits (public)
export const getWithdrawalSettings = async (req, res) => {
  try {
    const [settings] = await pool.query(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('min_withdrawal', 'max_withdrawal')"
    );
    const result = {};
    settings.forEach(s => { result[s.setting_key] = parseFloat(s.setting_value); });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get withdrawal settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch settings' });
  }
};

// =====================================================
// ADMIN ENDPOINTS
// =====================================================

// GET /api/admin/withdrawals - List all withdrawal requests
export const getAllWithdrawals = async (req, res) => {
  try {
    const status = req.query.status;
    let query = `SELECT wr.*, u.name, u.mobile, u.email, u.user_id as user_code
                 FROM withdrawal_requests wr
                 JOIN users u ON wr.user_id = u.id`;
    const params = [];
    if (status) {
      query += ' WHERE wr.status = ?';
      params.push(status);
    }
    query += ' ORDER BY wr.created_at DESC';

    const [withdrawals] = await pool.query(query, params);
    res.json({ success: true, data: withdrawals });
  } catch (error) {
    console.error('Get all withdrawals error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch withdrawals' });
  }
};

// PATCH /api/admin/withdrawals/:id - Approve or reject withdrawal
export const processWithdrawal = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { status, adminNote } = req.body;
    const adminId = req.admin.id;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be approved or rejected' });
    }

    const [requests] = await connection.query(
      'SELECT * FROM withdrawal_requests WHERE id = ?', [id]
    );
    if (requests.length === 0) {
      return res.status(404).json({ success: false, message: 'Withdrawal request not found' });
    }
    const request = requests[0];

    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'This request has already been processed' });
    }

    await connection.beginTransaction();

    await connection.query(
      `UPDATE withdrawal_requests SET status = ?, admin_note = ?, processed_by = ?, processed_at = NOW() WHERE id = ?`,
      [status, adminNote || null, adminId, id]
    );

    // If rejected, refund coins back to wallet
    if (status === 'rejected') {
      await creditCoins(connection, request.user_id, request.amount, 'adjustment', 'Withdrawal rejected - coins refunded', id);
    }

    await connection.commit();

    res.json({
      success: true,
      message: `Withdrawal ${status} successfully`,
      data: { id, status }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Process withdrawal error:', error);
    res.status(500).json({ success: false, message: 'Failed to process withdrawal' });
  } finally {
    connection.release();
  }
};

// GET /api/admin/system-settings - Get all system settings
export const getSystemSettings = async (req, res) => {
  try {
    const [settings] = await pool.query('SELECT * FROM system_settings ORDER BY setting_key');
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error('Get system settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch system settings' });
  }
};

// PUT /api/admin/system-settings - Update system settings
export const updateSystemSettings = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { settings } = req.body; // Array of { setting_key, setting_value }
    const adminId = req.admin.id;

    if (!Array.isArray(settings) || settings.length === 0) {
      return res.status(400).json({ success: false, message: 'Settings array is required' });
    }

    await connection.beginTransaction();

    for (const setting of settings) {
      if (!setting.setting_key || setting.setting_value === undefined) continue;
      await connection.query(
        `INSERT INTO system_settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
        [setting.setting_key, String(setting.setting_value), adminId]
      );
    }

    await connection.commit();
    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Update system settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  } finally {
    connection.release();
  }
};

// GET /api/admin/wallet-stats - Wallet statistics for admin dashboard
export const getWalletStats = async (req, res) => {
  try {
    const [stats] = await pool.query(`
      SELECT
        (SELECT COALESCE(SUM(coin_balance), 0) FROM wallets) as total_coins_in_circulation,
        (SELECT COALESCE(SUM(total_earned), 0) FROM wallets) as total_coins_earned,
        (SELECT COALESCE(SUM(total_withdrawn), 0) FROM wallets) as total_coins_withdrawn,
        (SELECT COUNT(*) FROM withdrawal_requests WHERE status = 'pending') as pending_withdrawals,
        (SELECT COALESCE(SUM(amount), 0) FROM withdrawal_requests WHERE status = 'pending') as pending_withdrawal_amount,
        (SELECT COALESCE(SUM(amount), 0) FROM withdrawal_requests WHERE status = 'approved') as total_approved_withdrawals
    `);
    res.json({ success: true, data: stats[0] });
  } catch (error) {
    console.error('Get wallet stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch wallet stats' });
  }
};

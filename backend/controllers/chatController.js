import db from '../config/database.js';

// Get chat history
export const getChatHistory = async (req, res) => {
  try {
    const { roomId = 1, limit = 50, offset = 0 } = req.query;

    const [messages] = await db.query(`
      SELECT 
        cm.*,
        CASE 
          WHEN cm.sender_type = 'USER' THEN u.name
          WHEN cm.sender_type = 'ADMIN' THEN a.username
        END as sender_name
      FROM chat_messages cm
      LEFT JOIN users u ON cm.sender_id = u.id AND cm.sender_type = 'USER'
      LEFT JOIN admin_users a ON cm.sender_id = a.id AND cm.sender_type = 'ADMIN'
      WHERE cm.room_id = ? AND cm.is_deleted = FALSE
      ORDER BY cm.created_at DESC
      LIMIT ? OFFSET ?
    `, [roomId, parseInt(limit), parseInt(offset)]);

    res.json({
      success: true,
      messages: messages.reverse(), // Oldest first
      count: messages.length
    });
  } catch (error) {
    console.error('Get chat history error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get chat settings
export const getChatSettings = async (req, res) => {
  try {
    const [settings] = await db.query('SELECT * FROM chat_settings WHERE id = 1');
    
    res.json({
      success: true,
      settings: settings[0] || {}
    });
  } catch (error) {
    console.error('Get chat settings error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Update chat settings (Admin only)
export const updateChatSettings = async (req, res) => {
  try {
    const {
      is_chat_enabled,
      rate_limit_seconds,
      max_message_length,
      max_messages_per_minute,
      announcement_text,
      chat_guidelines
    } = req.body;

    await db.query(`
      UPDATE chat_settings SET 
        is_chat_enabled = ?,
        rate_limit_seconds = ?,
        max_message_length = ?,
        max_messages_per_minute = ?,
        announcement_text = ?,
        chat_guidelines = ?
      WHERE id = 1
    `, [
      is_chat_enabled,
      rate_limit_seconds,
      max_message_length,
      max_messages_per_minute,
      announcement_text,
      chat_guidelines
    ]);

    res.json({
      success: true,
      message: 'Chat settings updated successfully'
    });
  } catch (error) {
    console.error('Update chat settings error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get all messages (Admin only - for moderation)
export const getAllMessages = async (req, res) => {
  try {
    const { limit = 100, offset = 0, includeDeleted = false } = req.query;

    const deletedFilter = includeDeleted === 'true' ? '' : 'AND is_deleted = FALSE';

    const [messages] = await db.query(`
      SELECT 
        cm.*,
        CASE 
          WHEN cm.sender_type = 'USER' THEN u.name
          WHEN cm.sender_type = 'ADMIN' THEN a.username
        END as sender_name,
        CASE 
          WHEN cm.sender_type = 'USER' THEN u.user_id
          ELSE NULL
        END as sender_user_id
      FROM chat_messages cm
      LEFT JOIN users u ON cm.sender_id = u.id AND cm.sender_type = 'USER'
      LEFT JOIN admin_users a ON cm.sender_id = a.id AND cm.sender_type = 'ADMIN'
      WHERE 1=1 ${deletedFilter}
      ORDER BY cm.created_at DESC
      LIMIT ? OFFSET ?
    `, [parseInt(limit), parseInt(offset)]);

    const [total] = await db.query(`
      SELECT COUNT(*) as count FROM chat_messages WHERE 1=1 ${deletedFilter}
    `);

    res.json({
      success: true,
      messages,
      total: total[0].count
    });
  } catch (error) {
    console.error('Get all messages error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Delete message (Admin only)
export const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const adminId = req.admin.id;

    await db.query(`
      UPDATE chat_messages 
      SET is_deleted = TRUE, deleted_by = ?, deleted_at = NOW()
      WHERE id = ?
    `, [adminId, messageId]);

    await db.query(`
      INSERT INTO chat_activity_logs (admin_id, action, entity_type, entity_id)
      VALUES (?, 'MESSAGE_DELETED', 'CHAT_MESSAGE', ?)
    `, [adminId, messageId]);

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get active bans (Admin only)
export const getActiveBans = async (req, res) => {
  try {
    const [bans] = await db.query(`
      SELECT 
        cb.*,
        u.name as user_name,
        u.user_id,
        a.username as banned_by_name
      FROM chat_bans cb
      JOIN users u ON cb.user_id = u.id
      LEFT JOIN admin_users a ON cb.banned_by = a.id
      WHERE cb.is_active = TRUE
      ORDER BY cb.created_at DESC
    `);

    res.json({
      success: true,
      bans
    });
  } catch (error) {
    console.error('Get active bans error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Ban user (Admin only)
export const banUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason, banType, duration } = req.body;
    const adminId = req.admin.id;

    let bannedUntil = null;
    if (banType === 'TEMPORARY' && duration) {
      bannedUntil = new Date(Date.now() + duration * 60 * 1000);
    }

    await db.query(`
      INSERT INTO chat_bans (user_id, banned_by, reason, ban_type, banned_until, is_active)
      VALUES (?, ?, ?, ?, ?, TRUE)
    `, [userId, adminId, reason, banType, bannedUntil]);

    await db.query(`
      INSERT INTO chat_activity_logs (admin_id, action, entity_type, entity_id, details)
      VALUES (?, 'USER_BANNED', 'USER', ?, ?)
    `, [adminId, userId, JSON.stringify({ reason, banType, duration })]);

    res.json({
      success: true,
      message: 'User banned successfully'
    });
  } catch (error) {
    console.error('Ban user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Unban user (Admin only)
export const unbanUser = async (req, res) => {
  try {
    const { banId } = req.params;
    const adminId = req.admin.id;

    await db.query(`
      UPDATE chat_bans 
      SET is_active = FALSE
      WHERE id = ?
    `, [banId]);

    const [ban] = await db.query('SELECT user_id FROM chat_bans WHERE id = ?', [banId]);

    await db.query(`
      INSERT INTO chat_activity_logs (admin_id, action, entity_type, entity_id)
      VALUES (?, 'USER_UNBANNED', 'USER', ?)
    `, [adminId, ban[0]?.user_id]);

    res.json({
      success: true,
      message: 'User unbanned successfully'
    });
  } catch (error) {
    console.error('Unban user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get reports (Admin only)
export const getReports = async (req, res) => {
  try {
    const { status = 'PENDING' } = req.query;

    const [reports] = await db.query(`
      SELECT 
        cr.*,
        cm.message,
        u1.name as reporter_name,
        u2.name as reported_user_name,
        u2.user_id as reported_user_id
      FROM chat_reports cr
      JOIN chat_messages cm ON cr.message_id = cm.id
      JOIN users u1 ON cr.reported_by = u1.id
      JOIN users u2 ON cr.reported_user_id = u2.id
      WHERE cr.status = ?
      ORDER BY cr.created_at DESC
    `, [status]);

    res.json({
      success: true,
      reports
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Update report status (Admin only)
export const updateReportStatus = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status, action_taken } = req.body;
    const adminId = req.admin.id;

    await db.query(`
      UPDATE chat_reports 
      SET status = ?, action_taken = ?, reviewed_by = ?, reviewed_at = NOW()
      WHERE id = ?
    `, [status, action_taken, adminId, reportId]);

    res.json({
      success: true,
      message: 'Report updated successfully'
    });
  } catch (error) {
    console.error('Update report status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get activity logs (Admin only)
export const getActivityLogs = async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;

    const [logs] = await db.query(`
      SELECT 
        cal.*,
        u.name as user_name,
        a.username as admin_name
      FROM chat_activity_logs cal
      LEFT JOIN users u ON cal.user_id = u.id
      LEFT JOIN admin_users a ON cal.admin_id = a.id
      ORDER BY cal.created_at DESC
      LIMIT ? OFFSET ?
    `, [parseInt(limit), parseInt(offset)]);

    res.json({
      success: true,
      logs
    });
  } catch (error) {
    console.error('Get activity logs error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get blocked words (Admin only)
export const getBlockedWords = async (req, res) => {
  try {
    const [words] = await db.query(`
      SELECT * FROM chat_blocked_words
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      words
    });
  } catch (error) {
    console.error('Get blocked words error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Add blocked word (Admin only)
export const addBlockedWord = async (req, res) => {
  try {
    const { word } = req.body;
    const adminId = req.admin.id;

    await db.query(`
      INSERT INTO chat_blocked_words (word, added_by, is_active)
      VALUES (?, ?, TRUE)
    `, [word.toLowerCase(), adminId]);

    res.json({
      success: true,
      message: 'Blocked word added successfully'
    });
  } catch (error) {
    console.error('Add blocked word error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Delete blocked word (Admin only)
export const deleteBlockedWord = async (req, res) => {
  try {
    const { wordId } = req.params;

    await db.query('DELETE FROM chat_blocked_words WHERE id = ?', [wordId]);

    res.json({
      success: true,
      message: 'Blocked word deleted successfully'
    });
  } catch (error) {
    console.error('Delete blocked word error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get online users
export const getOnlineUsers = async (req, res) => {
  try {
    // This would need to be tracked via Socket.IO connections
    // For now, return empty array - will be populated by socket.io
    res.json({
      success: true,
      users: []
    });
  } catch (error) {
    console.error('Get online users error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Accept chat guidelines
export const acceptGuidelines = async (req, res) => {
  try {
    const userId = req.user.id;

    await db.query(`
      INSERT INTO chat_user_preferences (user_id, has_accepted_guidelines)
      VALUES (?, TRUE)
      ON DUPLICATE KEY UPDATE has_accepted_guidelines = TRUE
    `, [userId]);

    res.json({
      success: true,
      message: 'Guidelines accepted'
    });
  } catch (error) {
    console.error('Accept guidelines error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get user preferences
export const getUserPreferences = async (req, res) => {
  try {
    const userId = req.user.id;

    const [prefs] = await db.query(`
      SELECT * FROM chat_user_preferences WHERE user_id = ?
    `, [userId]);

    res.json({
      success: true,
      preferences: prefs[0] || { has_accepted_guidelines: false }
    });
  } catch (error) {
    console.error('Get user preferences error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

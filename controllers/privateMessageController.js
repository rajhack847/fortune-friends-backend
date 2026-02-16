import db from '../config/database.js';

// Get all conversations for current user
export const getConversations = async (req, res) => {
  const userId = req.user.id;

  try {
    const [conversations] = await db.execute(`
      SELECT DISTINCT
        u.id as userId,
        u.name as userName,
        (
          SELECT message 
          FROM chat_private_messages 
          WHERE (sender_id = ? AND receiver_id = u.id) 
             OR (sender_id = u.id AND receiver_id = ?)
          ORDER BY created_at DESC 
          LIMIT 1
        ) as lastMessage,
        (
          SELECT created_at 
          FROM chat_private_messages 
          WHERE (sender_id = ? AND receiver_id = u.id) 
             OR (sender_id = u.id AND receiver_id = ?)
          ORDER BY created_at DESC 
          LIMIT 1
        ) as lastMessageTime,
        (
          SELECT COUNT(*) 
          FROM chat_private_messages 
          WHERE sender_id = u.id AND receiver_id = ? AND is_read = FALSE
        ) as unreadCount
      FROM users u
      WHERE u.id IN (
        SELECT DISTINCT 
          CASE 
            WHEN sender_id = ? THEN receiver_id
            ELSE sender_id
          END as other_user_id
        FROM chat_private_messages
        WHERE sender_id = ? OR receiver_id = ?
      )
      ORDER BY lastMessageTime DESC
    `, [userId, userId, userId, userId, userId, userId, userId, userId]);

    res.json({
      success: true,
      conversations
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversations'
    });
  }
};

// Get messages with a specific user
export const getPrivateMessages = async (req, res) => {
  const userId = req.user.id;
  const { otherUserId } = req.params;
  const limit = parseInt(req.query.limit) || 50;

  try {
    const [messages] = await db.execute(`
      SELECT 
        id,
        sender_id as senderId,
        receiver_id as receiverId,
        message,
        is_read as isRead,
        created_at as createdAt
      FROM chat_private_messages
      WHERE (sender_id = ? AND receiver_id = ?) 
         OR (sender_id = ? AND receiver_id = ?)
      ORDER BY created_at DESC
      LIMIT ?
    `, [userId, otherUserId, otherUserId, userId, limit]);

    // Mark messages as read
    await db.execute(`
      UPDATE chat_private_messages 
      SET is_read = TRUE 
      WHERE sender_id = ? AND receiver_id = ? AND is_read = FALSE
    `, [otherUserId, userId]);

    res.json({
      success: true,
      messages: messages.reverse()
    });
  } catch (error) {
    console.error('Error fetching private messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages'
    });
  }
};

// Send a private message
export const sendPrivateMessage = async (req, res) => {
  const userId = req.user.id;
  const { receiverId, message } = req.body;

  try {
    // Validate input
    if (!receiverId || !message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Receiver and message are required'
      });
    }

    // Check if receiver exists
    const [users] = await db.execute(
      'SELECT id, name FROM users WHERE id = ?',
      [receiverId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Receiver not found'
      });
    }

    // Check if blocked
    const [blocks] = await db.execute(
      'SELECT id FROM chat_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)',
      [userId, receiverId, receiverId, userId]
    );

    if (blocks.length > 0) {
      return res.status(403).json({
        success: false,
        message: 'Cannot send message to this user'
      });
    }

    // Insert message
    const [result] = await db.execute(
      `INSERT INTO chat_private_messages (sender_id, receiver_id, message, created_at) 
       VALUES (?, ?, ?, NOW())`,
      [userId, receiverId, message.trim()]
    );

    res.json({
      success: true,
      messageId: result.insertId,
      message: 'Message sent successfully'
    });
  } catch (error) {
    console.error('Error sending private message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message'
    });
  }
};

// Get all users for starting new conversations
export const getAvailableUsers = async (req, res) => {
  const userId = req.user.id;

  try {
    const [users] = await db.execute(`
      SELECT 
        u.id,
        u.name as name,
        u.email
      FROM users u
      WHERE u.id != ?
      AND u.id NOT IN (
        SELECT blocked_user_id FROM chat_blocks WHERE user_id = ?
        UNION
        SELECT user_id FROM chat_blocks WHERE blocked_user_id = ?
      )
      ORDER BY u.name
    `, [userId, userId, userId]);

    res.json({
      success: true,
      users
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
};

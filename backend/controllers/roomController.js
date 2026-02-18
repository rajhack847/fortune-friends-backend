import db from '../config/database.js';

// Get all public rooms
export const getRooms = async (req, res) => {
  try {
    const [rooms] = await db.execute(`
      SELECT 
        r.*,
        COUNT(DISTINCT rm.user_id) as member_count,
        COUNT(DISTINCT cm.id) as message_count
      FROM chat_rooms r
      LEFT JOIN chat_room_members rm ON r.id = rm.room_id
      LEFT JOIN chat_messages cm ON r.id = cm.room_id AND cm.deleted_at IS NULL
      WHERE r.is_active = TRUE
      GROUP BY r.id
      ORDER BY r.is_default DESC, r.created_at DESC
    `);

    res.json({
      success: true,
      rooms
    });
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rooms'
    });
  }
};

// Create a new room
export const createRoom = async (req, res) => {
  const { name, description } = req.body;
  const userId = req.user.id;

  try {
    // Validate input
    if (!name || name.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Room name must be at least 3 characters'
      });
    }

    // Check if room name already exists
    const [existing] = await db.execute(
      'SELECT id FROM chat_rooms WHERE name = ?',
      [name.trim()]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'A room with this name already exists'
      });
    }

    // Create room
    const [result] = await db.execute(
      `INSERT INTO chat_rooms (name, description, created_by) 
       VALUES (?, ?, ?)`,
      [name.trim(), description?.trim() || null, userId]
    );

    const roomId = result.insertId;

    // Add creator as member
    await db.execute(
      `INSERT INTO chat_room_members (room_id, user_id, joined_at) 
       VALUES (?, ?, NOW())`,
      [roomId, userId]
    );

    res.json({
      success: true,
      message: 'Room created successfully',
      roomId
    });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create room'
    });
  }
};

// Join a room
export const joinRoom = async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id;

  try {
    // Check if room exists and is active
    const [rooms] = await db.execute(
      'SELECT id, name FROM chat_rooms WHERE id = ? AND is_active = TRUE',
      [roomId]
    );

    if (rooms.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Room not found or inactive'
      });
    }

    // Check if already a member
    const [existing] = await db.execute(
      'SELECT id FROM chat_room_members WHERE room_id = ? AND user_id = ?',
      [roomId, userId]
    );

    if (existing.length > 0) {
      return res.json({
        success: true,
        message: 'Already a member of this room'
      });
    }

    // Add as member
    await db.execute(
      `INSERT INTO chat_room_members (room_id, user_id, joined_at) 
       VALUES (?, ?, NOW())`,
      [roomId, userId]
    );

    res.json({
      success: true,
      message: `Joined ${rooms[0].name} successfully`
    });
  } catch (error) {
    console.error('Error joining room:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to join room'
    });
  }
};

// Leave a room
export const leaveRoom = async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id;

  try {
    // Check if it's the default room
    const [rooms] = await db.execute(
      'SELECT is_default FROM chat_rooms WHERE id = ?',
      [roomId]
    );

    if (rooms.length > 0 && rooms[0].is_default) {
      return res.status(400).json({
        success: false,
        message: 'Cannot leave the default room'
      });
    }

    await db.execute(
      'DELETE FROM chat_room_members WHERE room_id = ? AND user_id = ?',
      [roomId, userId]
    );

    res.json({
      success: true,
      message: 'Left room successfully'
    });
  } catch (error) {
    console.error('Error leaving room:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to leave room'
    });
  }
};

// Get room messages
export const getRoomMessages = async (req, res) => {
  const { roomId } = req.params;
  const limit = parseInt(req.query.limit) || 50;

  try {
    const [messages] = await db.execute(`
      SELECT 
        cm.id,
        cm.message,
        cm.created_at as createdAt,
        u.id as senderId,
        u.name as senderName,
        'USER' as senderType
      FROM chat_messages cm
      JOIN users u ON cm.sender_id = u.id
      WHERE cm.room_id = ? AND cm.deleted_at IS NULL
      ORDER BY cm.created_at DESC
      LIMIT ?
    `, [roomId, limit]);

    res.json({
      success: true,
      messages: messages.reverse()
    });
  } catch (error) {
    console.error('Error fetching room messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages'
    });
  }
};

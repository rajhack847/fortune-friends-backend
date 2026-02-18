import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import db from './config/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fortune_friends_secret_key_2024';

// In-memory store for connected users
const connectedUsers = new Map();
const userRateLimits = new Map();

// Rate limit check function
const checkRateLimit = (userId) => {
  const now = Date.now();
  const userLimit = userRateLimits.get(userId) || { messages: [], lastMessage: 0 };
  
  // Check rate limit (2 seconds between messages)
  if (now - userLimit.lastMessage < 2000) {
    return false;
  }
  
  // Check messages per minute (max 10)
  userLimit.messages = userLimit.messages.filter(t => now - t < 60000);
  if (userLimit.messages.length >= 10) {
    return false;
  }
  
  // Update rate limit
  userLimit.messages.push(now);
  userLimit.lastMessage = now;
  userRateLimits.set(userId, userLimit);
  
  return true;
};

export const initializeSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: ['http://localhost:5173', 'http://localhost:5174', 'http://192.168.31.89:5173', 'http://192.168.56.1:5173'],
      credentials: true
    }
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      console.log('Socket middleware received token:', token); // Token logging
      
      if (!token) {
        console.error('Socket connection failed: No token provided.');
        return next(new Error('Authentication error: No token'));
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      console.log('Socket decoded token:', decoded); // Decoded token logging
      socket.userId = decoded.userId || decoded.id;
      socket.userType = decoded.type || decoded.role || 'USER';
      
      // Check if user is banned
      if (socket.userType === 'USER') {
        const [bans] = await db.query(
          'SELECT * FROM chat_bans WHERE user_id = ? AND is_active = TRUE AND (ban_type = "PERMANENT" OR banned_until > NOW())',
          [socket.userId]
        );
        
        if (bans.length > 0) {
          return next(new Error('You are banned from chat'));
        }

        // Check if user has accepted guidelines and notify client
        const [prefs] = await db.query(
          'SELECT has_accepted_guidelines FROM chat_user_preferences WHERE user_id = ?',
          [socket.userId]
        );
        
        if (prefs.length === 0 || !prefs[0].has_accepted_guidelines) {
          socket.needsGuidelines = true;
          socket.emit('guidelines:needed');
        } else {
          socket.needsGuidelines = false;
          socket.emit('guidelines:accepted');
        }
      }
      
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket) => {
    console.log(`User connected: ${socket.userId} (${socket.userType})`);
    
    // Store user connection
    connectedUsers.set(socket.userId, {
      socketId: socket.id,
      userType: socket.userType,
      online: true
    });

    // Get user info
    let userData = {};
    if (socket.userType === 'USER') {
      const [users] = await db.query('SELECT name, user_id FROM users WHERE id = ?', [socket.userId]);
      userData = users[0] || {};
    } else {
      const [admins] = await db.query('SELECT username as name FROM admin_users WHERE id = ?', [socket.userId]);
      userData = admins[0] || {};
    }

    // Broadcast user online status
    io.emit('user:status', {
      userId: socket.userId,
      username: userData.name,
      online: true
    });

    // Join global room
    socket.join('global');
    
    // Log activity
    await db.query(
      'INSERT INTO chat_activity_logs (user_id, admin_id, action, details) VALUES (?, ?, ?, ?)',
      [
        socket.userType === 'USER' ? socket.userId : null,
        socket.userType === 'ADMIN' ? socket.userId : null,
        'CONNECTED',
        JSON.stringify({ socketId: socket.id })
      ]
    );

    // Accept guidelines
    socket.on('accept:guidelines', async () => {
      if (socket.userType === 'USER') {
        if (!socket.userId) {
          console.error('accept:guidelines called with no socket.userId');
          return socket.emit('error', { message: 'Authentication error. Please reconnect.' });
        }
        try {
          await db.query(
            'INSERT INTO chat_user_preferences (user_id, has_accepted_guidelines) VALUES (?, TRUE) ON DUPLICATE KEY UPDATE has_accepted_guidelines = TRUE',
            [socket.userId]
          );
          socket.needsGuidelines = false;
          socket.emit('guidelines:accepted');
          console.log(`User ${socket.userId} accepted guidelines via socket`);
        } catch (error) {
          console.error('Error accepting guidelines:', error);
          socket.emit('error', { message: 'Failed to accept guidelines' });
        }
      }
    });

    // Send message
    socket.on('message:send', async (data) => {
      try {
        const { roomId, message, roomType = 'GLOBAL' } = data;

        // Check guidelines acceptance
        if (socket.needsGuidelines) {
          return socket.emit('error', { message: 'Please accept chat guidelines first' });
        }

        // Rate limiting
        const userId = socket.userId;
        const now = Date.now();
        const userLimit = userRateLimits.get(userId) || { messages: [], lastMessage: 0 };
        
        // Check rate limit (2 seconds between messages)
        if (now - userLimit.lastMessage < 2000) {
          return socket.emit('error', { message: 'Please wait before sending another message' });
        }

        // Check messages per minute (max 10)
        userLimit.messages = userLimit.messages.filter(t => now - t < 60000);
        if (userLimit.messages.length >= 10) {
          return socket.emit('error', { message: 'Too many messages. Please slow down.' });
        }

        // Validate message
        if (!message || message.trim().length === 0) {
          return socket.emit('error', { message: 'Message cannot be empty' });
        }

        if (message.length > 500) {
          return socket.emit('error', { message: 'Message too long (max 500 characters)' });
        }

        // Profanity filter
        const [blockedWords] = await db.query('SELECT word FROM chat_blocked_words WHERE is_active = TRUE');
        let filteredMessage = message;
        for (const row of blockedWords) {
          const regex = new RegExp(row.word, 'gi');
          filteredMessage = filteredMessage.replace(regex, '*'.repeat(row.word.length));
        }

        // Check for URLs (optional blocking)
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        if (urlRegex.test(filteredMessage)) {
          return socket.emit('error', { message: 'External links are not allowed' });
        }

        // Save message to database
        const [result] = await db.query(
          'INSERT INTO chat_messages (room_id, sender_id, sender_type, message, status) VALUES (?, ?, ?, ?, "SENT")',
          [roomId || 1, socket.userId, socket.userType, filteredMessage]
        );

        const messageId = result.insertId;

        // Update rate limit
        userLimit.messages.push(now);
        userLimit.lastMessage = now;
        userRateLimits.set(userId, userLimit);

        // Broadcast message
        const messageData = {
          id: messageId,
          roomId: roomId || 1,
          senderId: socket.userId,
          senderName: userData.name,
          senderType: socket.userType,
          message: filteredMessage,
          status: 'SENT',
          createdAt: new Date().toISOString()
        };

        if (roomType === 'GLOBAL') {
          io.to('global').emit('message:received', messageData);
        } else {
          // Private message
          socket.emit('message:received', messageData);
          const recipientData = connectedUsers.get(data.recipientId);
          if (recipientData) {
            io.to(recipientData.socketId).emit('message:received', messageData);
          }
        }

        // Log activity
        await db.query(
          'INSERT INTO chat_activity_logs (user_id, admin_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)',
          [
            socket.userType === 'USER' ? socket.userId : null,
            socket.userType === 'ADMIN' ? socket.userId : null,
            'MESSAGE_SENT',
            'CHAT_MESSAGE',
            messageId
          ]
        );

      } catch (error) {
        console.error('Message send error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Delete message (Admin only)
    socket.on('message:delete', async (data) => {
      if (socket.userType !== 'ADMIN') {
        return socket.emit('error', { message: 'Unauthorized' });
      }

      try {
        await db.query(
          'UPDATE chat_messages SET is_deleted = TRUE, deleted_by = ?, deleted_at = NOW() WHERE id = ?',
          [socket.userId, data.messageId]
        );

        io.to('global').emit('message:deleted', { messageId: data.messageId });

        await db.query(
          'INSERT INTO chat_activity_logs (admin_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?)',
          [socket.userId, 'MESSAGE_DELETED', 'CHAT_MESSAGE', data.messageId]
        );
      } catch (error) {
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });

    // Ban user (Admin only)
    socket.on('user:ban', async (data) => {
      if (socket.userType !== 'ADMIN') {
        return socket.emit('error', { message: 'Unauthorized' });
      }

      try {
        const { userId, reason, banType, duration } = data;
        
        let bannedUntil = null;
        if (banType === 'TEMPORARY' && duration) {
          bannedUntil = new Date(Date.now() + duration * 60 * 1000).toISOString();
        }

        await db.query(
          'INSERT INTO chat_bans (user_id, banned_by, reason, ban_type, banned_until, is_active) VALUES (?, ?, ?, ?, ?, TRUE)',
          [userId, socket.userId, reason, banType, bannedUntil]
        );

        // Disconnect banned user
        const bannedUser = connectedUsers.get(userId);
        if (bannedUser) {
          io.to(bannedUser.socketId).emit('banned', { reason });
          io.sockets.sockets.get(bannedUser.socketId)?.disconnect();
        }

        socket.emit('user:banned', { userId });
      } catch (error) {
        socket.emit('error', { message: 'Failed to ban user' });
      }
    });

    // Report message
    socket.on('message:report', async (data) => {
      try {
        const { messageId, reason, description } = data;

        const [messages] = await db.query('SELECT sender_id FROM chat_messages WHERE id = ?', [messageId]);
        if (messages.length === 0) {
          return socket.emit('error', { message: 'Message not found' });
        }

        await db.query(
          'INSERT INTO chat_reports (message_id, reported_by, reported_user_id, reason, description, status) VALUES (?, ?, ?, ?, ?, "PENDING")',
          [messageId, socket.userId, messages[0].sender_id, reason, description]
        );

        socket.emit('message:reported', { messageId });
      } catch (error) {
        socket.emit('error', { message: 'Failed to report message' });
      }
    });

    // Typing indicator
    socket.on('typing:start', (data) => {
      socket.to('global').emit('typing:user', {
        userId: socket.userId,
        username: userData.name,
        isTyping: true
      });
    });

    socket.on('typing:stop', () => {
      socket.to('global').emit('typing:user', {
        userId: socket.userId,
        username: userData.name,
        isTyping: false
      });
    });

    // Disconnect
    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.userId}`);
      
      connectedUsers.delete(socket.userId);
      userRateLimits.delete(socket.userId);

      // Broadcast user offline status
      io.emit('user:status', {
        userId: socket.userId,
        username: userData.name,
        online: false
      });

      await db.query(
        'INSERT INTO chat_activity_logs (user_id, admin_id, action) VALUES (?, ?, ?)',
        [
          socket.userType === 'USER' ? socket.userId : null,
          socket.userType === 'ADMIN' ? socket.userId : null,
          'DISCONNECTED'
        ]
      );
    });

    // ===== ROOM EVENTS =====
    
    // Join a room
    socket.on('room:join', async (data) => {
      try {
        const { roomId } = data;
        
        // Check if user is a member
        const [members] = await db.query(
          'SELECT id FROM chat_room_members WHERE room_id = ? AND user_id = ?',
          [roomId, socket.userId]
        );
        
        if (members.length > 0 || socket.userType === 'ADMIN') {
          socket.join(`room-${roomId}`);
          socket.currentRoom = roomId;
          
          // Notify room members
          socket.to(`room-${roomId}`).emit('room:user_joined', {
            userId: socket.userId,
            username: userData.name
          });
          
          socket.emit('room:joined', { roomId });
        } else {
          socket.emit('error', { message: 'Not a member of this room' });
        }
      } catch (error) {
        console.error('Error joining room:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // Leave a room
    socket.on('room:leave', (data) => {
      const { roomId } = data;
      socket.leave(`room-${roomId}`);
      
      socket.to(`room-${roomId}`).emit('room:user_left', {
        userId: socket.userId,
        username: userData.name
      });
      
      socket.emit('room:left', { roomId });
    });

    // Send message to room
    socket.on('room:message', async (data) => {
      try {
        if (socket.needsGuidelines) {
          return socket.emit('error', { message: 'Please accept chat guidelines first' });
        }

        const { roomId, message } = data;

        // Rate limiting check
        if (!checkRateLimit(socket.userId)) {
          return socket.emit('error', { message: 'Slow down! You\'re sending messages too fast.' });
        }

        // Always fetch user info for this socket
        let userData = {};
        if (socket.userType === 'USER') {
          const [users] = await db.query('SELECT name, user_id FROM users WHERE id = ?', [socket.userId]);
          userData = users[0] || {};
        } else {
          const [admins] = await db.query('SELECT username as name FROM admin_users WHERE id = ?', [socket.userId]);
          userData = admins[0] || {};
        }

        // Save message to database
        const [result] = await db.query(
          `INSERT INTO chat_messages (room_id, sender_id, message, created_at) 
           VALUES (?, ?, ?, NOW())`,
          [roomId, socket.userId, message]
        );

        // Broadcast to room
        io.to(`room-${roomId}`).emit('room:new_message', {
          id: result.insertId,
          roomId,
          message,
          senderId: socket.userId,
          senderName: userData.name,
          senderType: socket.userType,
          createdAt: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error sending room message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // ===== PRIVATE MESSAGE EVENTS =====
    
    // Send private message
    socket.on('private:message', async (data) => {
      try {
        if (socket.needsGuidelines) {
          return socket.emit('error', { message: 'Please accept chat guidelines first' });
        }

        const { receiverId, message } = data;

        // Check if blocked
        const [blocks] = await db.query(
          'SELECT id FROM chat_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)',
          [socket.userId, receiverId, receiverId, socket.userId]
        );

        if (blocks.length > 0) {
          return socket.emit('error', { message: 'Cannot send message to this user' });
        }

        // Rate limiting check
        if (!checkRateLimit(socket.userId)) {
          return socket.emit('error', { message: 'Slow down! You\'re sending messages too fast.' });
        }

        // Save message to database
        const [result] = await db.query(
          `INSERT INTO chat_private_messages (sender_id, receiver_id, message, created_at) 
           VALUES (?, ?, ?, NOW())`,
          [socket.userId, receiverId, message]
        );

        const messageData = {
          id: result.insertId,
          senderId: socket.userId,
          senderName: userData.name,
          receiverId,
          message,
          isRead: false,
          createdAt: new Date().toISOString()
        };

        // Send to receiver if online
        const receiverSocketId = Array.from(connectedUsers.entries())
          .find(([id, userId]) => userId === receiverId)?.[0];

        if (receiverSocketId) {
          io.to(receiverSocketId).emit('private:new_message', messageData);
        }

        // Confirm to sender
        socket.emit('private:message_sent', messageData);
      } catch (error) {
        console.error('Error sending private message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Typing indicator for private chat
    socket.on('private:typing', (data) => {
      const { receiverId, isTyping } = data;
      
      const receiverSocketId = Array.from(connectedUsers.entries())
        .find(([id, userId]) => userId === receiverId)?.[0];

      if (receiverSocketId) {
        io.to(receiverSocketId).emit('private:user_typing', {
          userId: socket.userId,
          username: userData.name,
          isTyping
        });
      }
    });

    // Mark private messages as read
    socket.on('private:mark_read', async (data) => {
      try {
        const { senderId } = data;
        
        await db.query(
          'UPDATE chat_private_messages SET is_read = TRUE WHERE sender_id = ? AND receiver_id = ? AND is_read = FALSE',
          [senderId, socket.userId]
        );

        // Notify sender that messages were read
        const senderSocketId = Array.from(connectedUsers.entries())
          .find(([id, userId]) => userId === senderId)?.[0];

        if (senderSocketId) {
          io.to(senderSocketId).emit('private:messages_read', {
            readBy: socket.userId
          });
        }
      } catch (error) {
        console.error('Error marking messages as read:', error);
      }
    });
  });

  return io;
};

export default initializeSocket;

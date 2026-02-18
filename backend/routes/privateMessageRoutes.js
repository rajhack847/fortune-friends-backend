import express from 'express';
import * as privateMessageController from '../controllers/privateMessageController.js';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateUser);

// Get all conversations
router.get('/conversations', privateMessageController.getConversations);

// Get available users
router.get('/users', privateMessageController.getAvailableUsers);

// Get messages with a specific user
router.get('/:otherUserId/messages', privateMessageController.getPrivateMessages);

// Send a private message
router.post('/send', privateMessageController.sendPrivateMessage);

export default router;

import express from 'express';
import * as roomController from '../controllers/roomController.js';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateUser);

// Get all rooms
router.get('/', roomController.getRooms);

// Create a new room
router.post('/create', roomController.createRoom);

// Join a room
router.post('/:roomId/join', roomController.joinRoom);

// Leave a room
router.delete('/:roomId/leave', roomController.leaveRoom);

// Get room messages
router.get('/:roomId/messages', roomController.getRoomMessages);

export default router;

import express from 'express';
import { getUserTickets, getTicketStats } from '../controllers/ticketController.js';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

// User routes
router.get('/my-tickets', authenticateUser, getUserTickets);
router.get('/stats', authenticateUser, getTicketStats);

export default router;

import express from 'express';
import { 
  getActiveLottery, 
  getLotteryStats, 
  getUserWinningChance, 
  drawWinner, 
  getWinners 
} from '../controllers/lotteryController.js';
import { authenticateUser, authenticateAdmin, requireRole } from '../middleware/auth.js';
import { logAdminAction } from '../middleware/auditLog.js';

const router = express.Router();

// Public/User routes
router.get('/active', getActiveLottery);
router.get('/:lotteryEventId/stats', getLotteryStats);
router.get('/:lotteryEventId/my-chance', authenticateUser, getUserWinningChance);
router.get('/winners', getWinners);

// Admin routes
router.post('/:lotteryEventId/draw', authenticateAdmin, requireRole('super_admin', 'admin'), logAdminAction('DRAW_WINNER', 'lottery_event'), drawWinner);

export default router;

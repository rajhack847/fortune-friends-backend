import express from 'express';
import { 
  getActiveLottery, 
  getLotteryStats, 
  getUserWinningChance, 
  drawWinner, 
  getWinners 
} from '../controllers/fortuneDrawController.js';
import { authenticateUser, authenticateAdmin, requireRole } from '../middleware/auth.js';
import { logAdminAction } from '../middleware/auditLog.js';

const router = express.Router();

// Root info for fortune-draw
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Fortune Draw routes',
    endpoints: {
      active: '/api/fortune-draw/active',
      stats: '/api/fortune-draw/:fortuneDrawEventId/stats',
      myChance: '/api/fortune-draw/:fortuneDrawEventId/my-chance',
      winners: '/api/fortune-draw/winners',
      draw: '/api/fortune-draw/:fortuneDrawEventId/draw (POST - admin)'
    }
  });
});

// Public/User routes
router.get('/active', getActiveLottery);
router.get('/:fortuneDrawEventId/stats', getLotteryStats);
router.get('/:fortuneDrawEventId/my-chance', authenticateUser, getUserWinningChance);
router.get('/winners', getWinners);

// Admin routes
router.post('/:fortuneDrawEventId/draw', authenticateAdmin, requireRole('super_admin', 'admin'), logAdminAction('DRAW_WINNER', 'lottery_event'), drawWinner);

export default router;

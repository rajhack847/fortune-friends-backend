import express from 'express';
import { getUserReferrals, getReferralStats, getReferralTree } from '../controllers/referralController.js';
import { authenticateUser, authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

// User routes
router.get('/my-referrals', authenticateUser, getUserReferrals);
router.get('/stats', authenticateUser, getReferralStats);

// Admin routes
router.get('/tree/:userId', authenticateAdmin, getReferralTree);

export default router;

import express from 'express';
import {
  getWallet,
  getWalletTransactions,
  requestWithdrawal,
  getMyWithdrawals,
  getWithdrawalSettings
} from '../controllers/walletController.js';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

// User routes (all require authentication)
router.get('/', authenticateUser, getWallet);
router.get('/transactions', authenticateUser, getWalletTransactions);
router.post('/withdraw', authenticateUser, requestWithdrawal);
router.get('/withdrawals', authenticateUser, getMyWithdrawals);
router.get('/settings', authenticateUser, getWithdrawalSettings);

export default router;

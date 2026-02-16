import express from 'express';
import { getPaymentSettings, updatePaymentSettings } from '../controllers/paymentSettingsController.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

// Public route - get payment settings
router.get('/', getPaymentSettings);

// Admin routes
router.put('/', authenticateAdmin, updatePaymentSettings);

export default router;

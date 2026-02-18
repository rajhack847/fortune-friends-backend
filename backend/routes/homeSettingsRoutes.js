import express from 'express';
import { getHomeSettings, updateHomeSettings } from '../controllers/homeSettingsController.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

// Public route - get home settings
router.get('/', getHomeSettings);

// Admin routes
router.put('/', authenticateAdmin, updateHomeSettings);

export default router;

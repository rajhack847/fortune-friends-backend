import express from 'express';
import { registerUser, loginUser, getUserProfile, updateUserProfile, changePassword } from '../controllers/userController.js';
import { authenticateUser } from '../middleware/auth.js';
import fileUpload from 'express-fileupload';

const router = express.Router();

// Public routes
router.post('/register', registerUser);
router.post('/login', loginUser);

// Protected routes
router.get('/profile', authenticateUser, getUserProfile);
router.put('/profile', authenticateUser, fileUpload(), updateUserProfile);
router.post('/change-password', authenticateUser, changePassword);

export default router;

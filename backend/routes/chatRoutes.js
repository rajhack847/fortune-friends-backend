import express from 'express';
import * as chatController from '../controllers/chatController.js';
import { authenticateUser } from '../middleware/auth.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

// User routes (require user authentication)
router.get('/history', authenticateUser, chatController.getChatHistory);
router.get('/settings', authenticateUser, chatController.getChatSettings);
router.post('/guidelines/accept', authenticateUser, chatController.acceptGuidelines);
router.get('/preferences', authenticateUser, chatController.getUserPreferences);
router.get('/online-users', authenticateUser, chatController.getOnlineUsers);

// Admin routes (require admin authentication)
router.get('/admin/messages', authenticateAdmin, chatController.getAllMessages);
router.delete('/admin/messages/:messageId', authenticateAdmin, chatController.deleteMessage);
router.put('/admin/settings', authenticateAdmin, chatController.updateChatSettings);

router.get('/admin/bans', authenticateAdmin, chatController.getActiveBans);
router.post('/admin/bans/:userId', authenticateAdmin, chatController.banUser);
router.delete('/admin/bans/:banId', authenticateAdmin, chatController.unbanUser);

router.get('/admin/reports', authenticateAdmin, chatController.getReports);
router.put('/admin/reports/:reportId', authenticateAdmin, chatController.updateReportStatus);

router.get('/admin/logs', authenticateAdmin, chatController.getActivityLogs);

router.get('/admin/blocked-words', authenticateAdmin, chatController.getBlockedWords);
router.post('/admin/blocked-words', authenticateAdmin, chatController.addBlockedWord);
router.delete('/admin/blocked-words/:wordId', authenticateAdmin, chatController.deleteBlockedWord);

export default router;

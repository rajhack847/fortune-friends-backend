import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { 
  adminLogin, 
  createLotteryEvent, 
  updateLotteryEvent, 
  getAllLotteryEvents, 
  markPrizeDelivered,
  getDashboardStats,
  getTopReferrers,
  getAllUsers,
  getUserById,
  getUserPublic,
  createUser,
  updateUser,
  toggleUserStatus,
  deleteUser
} from '../controllers/adminController.js';
import { getAdminAccounts, createAdminAccount, updateAdminAccount, deleteAdminAccount, changeMyPassword, getAvailablePermissions } from '../controllers/adminController.js';
import { getRolePermissions } from '../controllers/adminController.js';
import { authenticateAdmin, requireRole } from '../middleware/auth.js';
import { logAdminAction } from '../middleware/auditLog.js';

const router = express.Router();

// Get __dirname equivalent in ES6 modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for car image uploads
const carImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../frontend/public/images');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Keep original filename (dzire.jpg or crysta.jpg)
    cb(null, file.originalname);
  }
});

const carImageUpload = multer({ 
  storage: carImageStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG) are allowed'));
    }
  }
});

// Public routes
router.post('/login', adminLogin);

// Protected admin routes
router.get('/dashboard', authenticateAdmin, getDashboardStats);
router.get('/top-referrers', authenticateAdmin, getTopReferrers);
// Temporary debug endpoint: returns sample top referrers without auth (for local testing)
router.get('/top-referrers-sample', (req, res) => {
  const sample = [
    { id: 1, name: 'Alice Kumar', email: 'alice.kumar@example.com', referral_code: 'REFALICE', referrals_count: 24 },
    { id: 2, name: 'Bob Singh', email: 'bob.singh@example.com', referral_code: 'REFBOB', referrals_count: 18 },
    { id: 3, name: 'Carol Patel', email: 'carol.patel@example.com', referral_code: 'REFCAROL', referrals_count: 12 },
    { id: 4, name: 'Deepak Rao', email: 'deepak.rao@example.com', referral_code: 'REFDEEPAK', referrals_count: 9 },
    { id: 5, name: 'Esha Mehta', email: 'esha.mehta@example.com', referral_code: 'REFESHA', referrals_count: 7 }
  ];
  res.json({ success: true, data: sample });
});

// Dev-only public user info (no auth) for local testing
router.get('/users/:id/public', (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ success: false, message: 'Not found' });
  }
  return getUserPublic(req, res);
});
router.get('/lottery-events', authenticateAdmin, getAllLotteryEvents);
router.post('/lottery-events', authenticateAdmin, requireRole('super_admin', 'admin'), logAdminAction('CREATE_LOTTERY_EVENT', 'lottery_event'), carImageUpload.single('carImage'), createLotteryEvent);
router.patch('/lottery-events/:id', authenticateAdmin, requireRole('super_admin', 'admin'), logAdminAction('UPDATE_LOTTERY_EVENT', 'lottery_event'), carImageUpload.single('carImage'), updateLotteryEvent);
router.patch('/winners/:winnerId/deliver', authenticateAdmin, requireRole('super_admin', 'admin'), logAdminAction('MARK_PRIZE_DELIVERED', 'winner'), markPrizeDelivered);

// User management routes
router.get('/users', authenticateAdmin, getAllUsers);
router.get('/users/:id', authenticateAdmin, getUserById);
router.post('/users', authenticateAdmin, requireRole('super_admin', 'admin'), logAdminAction('CREATE_USER', 'user'), createUser);
router.put('/users/:id', authenticateAdmin, requireRole('super_admin', 'admin'), logAdminAction('UPDATE_USER', 'user'), updateUser);
router.post('/users/:id/status', authenticateAdmin, requireRole('super_admin', 'admin'), logAdminAction('TOGGLE_USER_STATUS', 'user'), toggleUserStatus);
router.delete('/users/:id', authenticateAdmin, requireRole('super_admin', 'admin'), logAdminAction('DELETE_USER', 'user'), deleteUser);

// Admin accounts management
router.get('/accounts', authenticateAdmin, requireRole('super_admin', 'admin'), getAdminAccounts);
router.post('/accounts', authenticateAdmin, requireRole('super_admin'), createAdminAccount);
// Allow both super_admin and admin roles to update admin accounts (permission changes)
router.patch('/accounts/:id', authenticateAdmin, requireRole('super_admin', 'admin'), updateAdminAccount);
router.delete('/accounts/:id', authenticateAdmin, requireRole('super_admin'), deleteAdminAccount);

// Permissions list
router.get('/accounts/permissions', authenticateAdmin, requireRole('super_admin', 'admin'), getAvailablePermissions);
// Role -> permissions mapping (useful to show role-wise permissions in admin UI)
router.get('/accounts/role-permissions', authenticateAdmin, requireRole('super_admin', 'admin'), getRolePermissions);

// Change own password
router.post('/change-password', authenticateAdmin, changeMyPassword);

export default router;

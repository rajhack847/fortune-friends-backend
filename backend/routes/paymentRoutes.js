import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { submitPayment, getUserPayments, getPendingPayments, verifyPayment, handleRazorpayWebhook, createRazorpayOrder, confirmRazorpayPayment } from '../controllers/paymentController.js';
import { authenticateUser, authenticateAdmin, requireRole } from '../middleware/auth.js';
import { logAdminAction } from '../middleware/auditLog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/payments'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'payment-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only images (JPEG, PNG) and PDF files are allowed'));
    }
  }
});

// User routes
router.post('/submit', authenticateUser, upload.single('screenshot'), submitPayment);
router.get('/my-payments', authenticateUser, getUserPayments);

// Razorpay webhook (public endpoint). Use raw body to verify signature.
router.post('/razorpay/webhook', express.raw({ type: 'application/json' }), handleRazorpayWebhook);

// Create order for Razorpay Checkout (authenticated)
router.post('/razorpay/create-order', authenticateUser, createRazorpayOrder);
// Confirm payment after Checkout completes
router.post('/razorpay/confirm', authenticateUser, express.json(), confirmRazorpayPayment);

// Admin routes
router.get('/pending', authenticateAdmin, getPendingPayments);
router.patch('/:paymentId/verify', authenticateAdmin, requireRole('super_admin', 'admin', 'verifier'), logAdminAction('VERIFY_PAYMENT', 'payment'), verifyPayment);

export default router;

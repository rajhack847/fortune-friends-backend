import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer } from 'http';


// Import routes
import userRoutes from './routes/userRoutes.js';
import ticketRoutes from './routes/ticketRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import referralRoutes from './routes/referralRoutes.js';
import fortuneDrawRoutes from './routes/fortuneDrawRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import paymentSettingsRoutes from './routes/paymentSettingsRoutes.js';
import homeSettingsRoutes from './routes/homeSettingsRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import roomRoutes from './routes/roomRoutes.js';
import privateMessageRoutes from './routes/privateMessageRoutes.js';

// Import Socket.IO
import initializeSocket from './socket.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Allow CORS with credential support and dynamic origin (echo request origin)
app.use(cors({ origin: true, credentials: true }));

// Ensure CORS response headers echo the request origin and allow credentials
// This helps with requests that use `credentials: 'include'` from the frontend.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());

app.use(morgan('dev'));
// Limit JSON/body sizes to prevent large payload abuse
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

// Simple in-memory rate limiter (per-IP)
const rateStore = new Map();
const rateLimit = ({ windowMs = 15 * 60 * 1000, max = 100, message = 'Too many requests, please try again later.' } = {}) => {
  return (req, res, next) => {
    try {
      const key = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
      const now = Date.now();
      const windowStart = now - windowMs;
      let entry = rateStore.get(key) || [];
      // keep only timestamps in window
      entry = entry.filter(ts => ts > windowStart);
      entry.push(now);
      rateStore.set(key, entry);
      if (entry.length > max) {
        res.status(429).json({ success: false, message });
        return;
      }
    } catch (e) {
      // on error, do not block request
      console.error('Rate limiter error:', e && (e.stack || e));
    }
    next();
  };
};

// Apply a mild global rate limit
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

// Access log: append one line per request when response finishes
try {
  const accessLogDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(accessLogDir)) fs.mkdirSync(accessLogDir, { recursive: true });
  const accessLogPath = path.join(accessLogDir, 'requests-access.log');
  // Ensure file exists
  if (!fs.existsSync(accessLogPath)) fs.writeFileSync(accessLogPath, '', { flag: 'a' });

  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const entry = `${new Date().toISOString()} ${req.ip} ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms` +
        ` headers=${JSON.stringify({host: req.headers.host, referer: req.headers.referer})}` + '\n';
      fs.appendFile(accessLogPath, entry, (err) => {
        if (err) console.error('Failed to write access log:', err && (err.stack || err));
      });
    });
    next();
  });
} catch (e) {
  console.error('Failed to initialize access logging:', e && (e.stack || e));
}

// Serve uploaded files with CORS headers using setHeaders in express.static
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure upload directories exist to prevent ENOENT on file uploads
 
const uploadBase = path.join(__dirname, 'uploads');
const ensureDir = (p) => {
  try {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  } catch (e) {
    console.error('Failed to create upload dir', p, e.message);
  }
};

ensureDir(uploadBase);
ensureDir(path.join(uploadBase, 'profiles'));
ensureDir(path.join(uploadBase, 'payments'));
ensureDir(path.join(uploadBase, 'lottery'));

// API Routes
app.use('/api/users', userRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/fortune-draw', fortuneDrawRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payment-settings', paymentSettingsRoutes);
app.use('/api/home-settings', homeSettingsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/chat/rooms', roomRoutes);
app.use('/api/chat/private', privateMessageRoutes);

// Protect login endpoints with a stricter rate limit to prevent brute-force
app.use('/api/users/login', rateLimit({ windowMs: 60 * 1000, max: 6, message: 'Too many login attempts, please wait a minute.' }));
app.use('/api/admin/login', rateLimit({ windowMs: 60 * 1000, max: 6, message: 'Too many login attempts, please wait a minute.' }));

// Root route
app.get('/', (req, res) => {
  res.json({ 
    success: true,
    message: 'Fortune Friends Fortune Draw API',
    version: '1.0.0',
    endpoints: {
      users: '/api/users',
      tickets: '/api/tickets',
      payments: '/api/payments',
      referrals: '/api/referrals',
      fortuneDraw: '/api/fortune-draw',
      admin: '/api/admin',
      health: '/health'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Create HTTP server for Socket.IO
const httpServer = createServer(app);

// Initialize Socket.IO
const io = initializeSocket(httpServer);

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 API: http://localhost:${PORT}/api`);
  console.log(`💬 Chat WebSocket: ws://localhost:${PORT}`);
});

# Backend - Lottery Registration System

Backend API server for the Lottery Registration System with Referral Boosting.

## Features

- User registration with auto-generated IDs and referral codes
- Ticket purchase system with payment verification
- Weighted lottery draw algorithm
- Referral tracking and bonus entries
- Admin panel APIs
- Comprehensive audit logging

## Prerequisites

- Node.js 16+ 
- MySQL 8.0+

## Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.example .env
```

Edit `.env` with your database credentials and configuration.

3. Create database and run migrations:
```bash
npm run db:migrate
```

4. Seed initial data:
```bash
npm run db:seed
```

## Running the Server

Development:
```bash
npm run dev
```

Production:
```bash
npm start
```

Server will start on port 5000 (or configured PORT).

## API Endpoints

### User Routes (`/api/users`)
- `POST /register` - Register new user
- `POST /login` - User login
- `GET /profile` - Get user profile (authenticated)

### Ticket Routes (`/api/tickets`)
- `GET /my-tickets` - Get user's tickets (authenticated)
- `GET /stats` - Get ticket statistics (authenticated)

### Payment Routes (`/api/payments`)
- `POST /submit` - Submit payment with screenshot (authenticated)
- `GET /my-payments` - Get user's payments (authenticated)
- `GET /pending` - Get pending payments (admin)
- `PATCH /:paymentId/verify` - Verify payment (admin)

### Referral Routes (`/api/referrals`)
- `GET /my-referrals` - Get user's referrals (authenticated)
- `GET /stats` - Get referral statistics (authenticated)
- `GET /tree/:userId` - Get referral tree (admin)

### Lottery Routes (`/api/lottery`)
- `GET /active` - Get active lottery event
- `GET /:lotteryEventId/stats` - Get lottery statistics
- `GET /:lotteryEventId/my-chance` - Get winning probability (authenticated)
- `GET /winners` - Get winners list
- `POST /:lotteryEventId/draw` - Draw winner (admin)

### Admin Routes (`/api/admin`)
- `POST /login` - Admin login
- `GET /dashboard` - Dashboard statistics (admin)
- `GET /lottery-events` - Get all lottery events (admin)
- `POST /lottery-events` - Create lottery event (admin)
- `PATCH /lottery-events/:id` - Update lottery event (admin)
- `PATCH /winners/:winnerId/deliver` - Mark prize delivered (admin)

## Database Schema

See `/database/schema.sql` for complete database structure.

### Key Tables:
- `users` - User accounts with referral codes
- `lottery_events` - Lottery events/draws
- `payments` - Payment submissions with screenshot verification
- `tickets` - Generated lottery tickets
- `referrals` - Referral relationships
- `winners` - Lottery winners
- `admin_users` - Admin accounts
- `audit_logs` - Admin action logs

## Lottery Algorithm

### Weighted Random Selection:
- **Base Entries** = Number of approved tickets purchased
- **Bonus Entries** = Number of successful paid referrals
- **Total Weight** = Base Entries + Bonus Entries
- Higher weight = Higher winning probability

## File Upload

Payment screenshots are stored in `/uploads/payments/` directory with SHA-256 hash verification to prevent duplicate uploads.

## Security Features

- JWT authentication for users and admins
- Password hashing with bcryptjs
- File upload validation
- Screenshot duplicate detection
- SQL injection prevention
- Audit logging for admin actions

## Default Credentials

Admin:
- Username: `admin`
- Password: `Admin@123`

**⚠️ Change these in production!**

## License

ISC

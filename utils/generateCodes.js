import crypto from 'crypto';

export const generateUserId = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `USER${timestamp}${random}`;
};

export const generateReferralCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const generateTicketNumber = (fortuneDrawEventId) => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `LT${fortuneDrawEventId}-${timestamp}-${random}`;
};

export const generatePaymentId = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `PAY${timestamp}${random}`;
};

export const generateReferralLink = (referralCode) => {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${baseUrl}/register?ref=${referralCode}`;
};

export const hashFile = (buffer) => {
  return crypto.createHash('sha256').update(buffer).digest('hex');
};

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import pool from './database.js';
import { 
  generateUserId, 
  generateReferralCode, 
  generateReferralLink 
} from '../utils/generateCodes.js';

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    done(null, users[0]);
  } catch (error) {
    done(error, null);
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'https://fortune-friends-backend-1.onrender.com/api/auth/google/callback',
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const googleId = profile.id;
        const name = profile.displayName;

        // Check if user exists with this Google ID
        const [existingUsers] = await pool.query(
          'SELECT * FROM users WHERE google_id = ?',
          [googleId]
        );

        if (existingUsers.length > 0) {
          // User exists, check if they need missing fields
          const user = existingUsers[0];
          
          if (!user.user_id || !user.referral_code || !user.referral_link) {
            // Generate missing fields
            let userId = user.user_id;
            let userReferralCode = user.referral_code;
            let isUnique = false;
            
            while (!isUnique) {
              if (!userId) userId = generateUserId();
              if (!userReferralCode) userReferralCode = generateReferralCode();
              
              const [duplicate] = await pool.query(
                'SELECT * FROM users WHERE (user_id = ? AND id != ?) OR (referral_code = ? AND id != ?)',
                [userId, user.id, userReferralCode, user.id]
              );
              
              if (duplicate.length === 0) {
                isUnique = true;
              } else {
                // Reset to try again
                userId = user.user_id;
                userReferralCode = user.referral_code;
              }
            }
            
            const referralLink = generateReferralLink(userReferralCode);
            
            // Update user with missing fields
            await pool.query(
              'UPDATE users SET user_id = ?, referral_code = ?, referral_link = ? WHERE id = ?',
              [userId, userReferralCode, referralLink, user.id]
            );
            
            // Fetch updated user
            const [updatedUsers] = await pool.query(
              'SELECT * FROM users WHERE id = ?',
              [user.id]
            );
            
            return done(null, updatedUsers[0]);
          }
          
          return done(null, user);
        }

        // Check if email is already registered with local auth
        const [emailUsers] = await pool.query(
          'SELECT * FROM users WHERE email = ?',
          [email]
        );

        if (emailUsers.length > 0) {
          // Link Google account to existing user
          const user = emailUsers[0];
          
          // Generate missing fields if needed
          let userId = user.user_id;
          let userReferralCode = user.referral_code;
          let referralLink = user.referral_link;
          
          if (!userId || !userReferralCode || !referralLink) {
            let isUnique = false;
            
            while (!isUnique) {
              if (!userId) userId = generateUserId();
              if (!userReferralCode) userReferralCode = generateReferralCode();
              
              const [duplicate] = await pool.query(
                'SELECT * FROM users WHERE (user_id = ? AND id != ?) OR (referral_code = ? AND id != ?)',
                [userId, user.id, userReferralCode, user.id]
              );
              
              if (duplicate.length === 0) {
                isUnique = true;
              } else {
                // Reset to try again
                userId = user.user_id;
                userReferralCode = user.referral_code;
              }
            }
            
            referralLink = generateReferralLink(userReferralCode);
          }
          
          await pool.query(
            'UPDATE users SET google_id = ?, auth_provider = ?, email_verified = TRUE, user_id = ?, referral_code = ?, referral_link = ? WHERE id = ?',
            [googleId, 'google', userId, userReferralCode, referralLink, user.id]
          );
          
          // Fetch updated user with all fields
          const [updatedUsers] = await pool.query(
            'SELECT * FROM users WHERE id = ?',
            [user.id]
          );
          
          return done(null, updatedUsers[0]);
        }

        // Create new user with Google auth
        // Generate unique codes
        let userId, userReferralCode, isUnique = false;
        
        while (!isUnique) {
          userId = generateUserId();
          userReferralCode = generateReferralCode();
          
          const [duplicate] = await pool.query(
            'SELECT * FROM users WHERE user_id = ? OR referral_code = ?',
            [userId, userReferralCode]
          );
          
          if (duplicate.length === 0) {
            isUnique = true;
          }
        }
        
        const referralLink = generateReferralLink(userReferralCode);
        
        const [result] = await pool.query(
          `INSERT INTO users (user_id, email, name, google_id, auth_provider, email_verified, kyc_status, referral_code, referral_link, mobile) 
           VALUES (?, ?, ?, ?, 'google', TRUE, 'not_submitted', ?, ?, ?)`,
          [userId, email, name, googleId, userReferralCode, referralLink, email] // Use email as mobile temporarily
        );

        // Fetch the complete user record with all fields
        const [newUsers] = await pool.query(
          'SELECT * FROM users WHERE id = ?',
          [result.insertId]
        );

        return done(null, newUsers[0]);
      } catch (error) {
        console.error('Google OAuth error:', error);
        return done(error, null);
      }
    }
  )
);

export default passport;

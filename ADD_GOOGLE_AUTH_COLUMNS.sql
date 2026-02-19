-- Add Google OAuth columns to users table
ALTER TABLE users 
  ADD COLUMN google_id VARCHAR(255) DEFAULT NULL UNIQUE COMMENT 'Google OAuth ID',
  ADD COLUMN auth_provider ENUM('local', 'google') DEFAULT 'local' COMMENT 'Authentication provider',
  ADD COLUMN email_verified BOOLEAN DEFAULT FALSE COMMENT 'Email verification status';

-- Update existing users to have email verified
UPDATE users SET email_verified = TRUE WHERE email IS NOT NULL;

-- Add index for faster Google ID lookups
CREATE INDEX idx_google_id ON users(google_id);

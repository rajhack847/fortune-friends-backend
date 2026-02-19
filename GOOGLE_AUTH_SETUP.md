# Google OAuth Setup Instructions

## ✅ What Was Added

Google Authentication has been integrated into Fortune Friends to prevent fake registrations. Users can now sign in with their Google accounts, ensuring:
- ✅ Email verification (Google handles it)
- ✅ No fake IDs (requires real Google account)
- ✅ Faster registration (less form fields)
- ✅ Better security (OAuth 2.0 standard)

## 📋 Implementation Checklist

### 1. Database Migration (REQUIRED)
Execute this SQL in phpMyAdmin:

```sql
-- Run ADD_GOOGLE_AUTH_COLUMNS.sql
ALTER TABLE users 
  ADD COLUMN google_id VARCHAR(255) DEFAULT NULL UNIQUE COMMENT 'Google OAuth ID',
  ADD COLUMN auth_provider ENUM('local', 'google') DEFAULT 'local' COMMENT 'Authentication provider',
  ADD COLUMN email_verified BOOLEAN DEFAULT FALSE COMMENT 'Email verification status';

UPDATE users SET email_verified = TRUE WHERE email IS NOT NULL;
CREATE INDEX idx_google_id ON users(google_id);
```

### 2. Google Cloud Console Setup

#### Step 1: Create Google Cloud Project
1. Go to https://console.cloud.google.com
2. Click **"Select a project"** → **"New Project"**
3. Name: `Fortune Friends`
4. Click **"Create"**

#### Step 2: Enable Google+ API
1. In your project, go to **"APIs & Services"** → **"Library"**
2. Search for **"Google+ API"**
3. Click **"Enable"**

#### Step 3: Create OAuth 2.0 Credentials
1. Go to **"APIs & Services"** → **"Credentials"**
2. Click **"Create Credentials"** → **"OAuth client ID"**
3. If prompted, configure **OAuth consent screen**:
   - User Type: **External**
   - App name: `Fortune Friends`
   - User support email: Your email
   - Developer contact: Your email
   - Scopes: Add `email` and `profile`
   - Test users: Add your email (for testing)
   - Click **"Save and Continue"**

4. Back to **Create OAuth client ID**:
   - Application type: **Web application**
   - Name: `Fortune Friends Web App`
   - **Authorized JavaScript origins:**
     ```
     https://win.fortunefriends.co.in
     http://localhost:5173
     ```
   - **Authorized redirect URIs:**
     ```
     https://fortune-friends-backend-1.onrender.com/api/auth/google/callback
     http://localhost:5000/api/auth/google/callback
     ```
   - Click **"Create"**

5. **Copy the credentials:**
   - Client ID: `1234567890-abcdefghijklmnop.apps.googleusercontent.com`
   - Client Secret: `GOCSPX-xxxxxxxxxxxxxxxxxxxxx`

### 3. Configure Backend Environment Variables

Add these to Render environment variables:

1. Go to **Render Dashboard** → **fortune-friends-backend-1**
2. Click **"Environment"** tab
3. Add these variables:

```env
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID_HERE
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET_HERE
GOOGLE_CALLBACK_URL=https://fortune-friends-backend-1.onrender.com/api/auth/google/callback
SESSION_SECRET=your-random-session-secret-here-minimum-32-chars
```

**To generate SESSION_SECRET:**
```powershell
# Run in PowerShell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
```

### 4. Deploy Code

#### Backend Deployment
```powershell
cd backend
git add .
git commit -m "Add: Google OAuth authentication"
git push origin master
```

Then deploy on Render:
1. Go to Render Dashboard
2. Click **fortune-friends-backend-1**
3. Click **"Manual Deploy"** → **"Deploy latest commit"**
4. Wait for deployment (check logs for "Your service is live 🎉")

#### Frontend Deployment
```powershell
cd frontend
npm run build
Compress-Archive -Path "dist\*" -DestinationPath "..\frontend-WITH-GOOGLE-AUTH.zip" -Force
```

Upload to Hostinger:
1. Go to Hostinger File Manager
2. Navigate to `/public_html/win.fortunefriends.co.in/`
3. Delete all files except `/admin/` folder
4. Upload `frontend-WITH-GOOGLE-AUTH.zip`
5. Extract the zip
6. Delete the zip file

### 5. Testing

#### Test Google Sign In:
1. Go to https://win.fortunefriends.co.in/register
2. Click **"Sign in with Google"** button
3. Select your Google account
4. Grant permissions
5. You should be redirected to Dashboard

#### Verify Database:
```sql
SELECT id, name, email, google_id, auth_provider, email_verified 
FROM users 
WHERE auth_provider = 'google';
```

## 🔧 How It Works

### Registration Flow:
1. User clicks "Sign in with Google"
2. User is redirected to Google OAuth consent screen
3. After granting permissions, Google redirects to backend callback
4. Backend checks if user exists:
   - **If exists:** Log them in
   - **If email exists (local auth):** Link Google account
   - **If new:** Create user with Google auth
5. Backend generates JWT token
6. Frontend receives token and user data
7. User is logged in and redirected to Dashboard

### Security Features:
- ✅ Email automatically verified by Google
- ✅ No password storage for Google users
- ✅ OAuth 2.0 standard security
- ✅ JWT tokens for session management
- ✅ Prevents duplicate accounts (links by email)

## 📊 Database Schema Changes

```javascript
users table:
  + google_id VARCHAR(255) - Google OAuth user ID
  + auth_provider ENUM('local', 'google') - How user registered
  + email_verified BOOLEAN - Email verification status
  + INDEX idx_google_id - Fast Google ID lookups
```

## 🚀 Production Checklist

Before going live:
- [ ] Database migration executed
- [ ] Google Cloud Console project created
- [ ] OAuth credentials configured
- [ ] Authorized redirect URIs added
- [ ] Environment variables set on Render
- [ ] Backend deployed with latest code
- [ ] Frontend deployed with Google button
- [ ] Test Google Sign In works
- [ ] Verify user created in database
- [ ] Test login with existing Google account
- [ ] Test referral code with Google auth

## 🐛 Troubleshooting

### "redirect_uri_mismatch" error:
- Check Authorized redirect URIs in Google Console
- Should be: `https://fortune-friends-backend-1.onrender.com/api/auth/google/callback`
- URLs must match EXACTLY (no trailing slash)

### Google button not showing:
- Clear browser cache (Ctrl+Shift+Delete)
- Check frontend build was uploaded correctly
- Verify `AuthCallback.jsx` exists in build

### "Invalid client" error:
- Check GOOGLE_CLIENT_ID environment variable
- Verify it matches Google Console credentials
- Redeploy backend after adding environment variables

### User not logged in after Google redirect:
- Check browser console for errors
- Verify `/auth/callback` route exists in App.jsx
- Check AuthCallback component is imported

## 📝 Files Changed

### Backend:
- ✅ `backend/config/passport.js` - Google OAuth strategy
- ✅ `backend/routes/authRoutes.js` - Auth endpoints
- ✅ `backend/server.js` - Passport middleware
- ✅ `backend/package.json` - New dependencies

### Frontend:
- ✅ `frontend/src/pages/Register.jsx` - Google Sign In button
- ✅ `frontend/src/pages/Login.jsx` - Google Sign In button
- ✅ `frontend/src/pages/AuthCallback.jsx` - OAuth redirect handler
- ✅ `frontend/src/App.jsx` - Auth callback route

### Database:
- ✅ `ADD_GOOGLE_AUTH_COLUMNS.sql` - Schema migration

## 🎯 Next Steps

After deployment:
1. Test Google Sign In yourself
2. Monitor backend logs for OAuth errors
3. Check database for new Google users
4. Consider removing password field from registration (optional)
5. Add "Verified by Google" badge to profiles (optional)

## 💡 Tips

- **Testing:** Add your email to Google OAuth test users during development
- **Security:** Never commit GOOGLE_CLIENT_SECRET to Git
- **UX:** Consider making Google Sign In the primary registration method
- **Mobile:** Google Sign In works on mobile browsers too
- **Analytics:** Track how many users sign up via Google vs local

---

**Status:** ✅ Implementation Complete - Ready for Deployment
**Files:** All code changes committed to Git
**Next:** Execute database migration → Configure Google Console → Deploy

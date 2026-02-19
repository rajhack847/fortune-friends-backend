import { useState, useEffect, useRef } from 'react';
import { userAPI, ticketAPI, referralAPI } from '../services/api';

const backendURL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'https://fortune-friends-backend-1.onrender.com';

// Shared styles
const styles = {
  page: { maxWidth: 980, margin: '24px auto', fontFamily: "Inter, Roboto, -apple-system, 'Segoe UI', Arial" },
  headerRow: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 },
  avatarSmall: { width: 96, height: 96, borderRadius: 12, objectFit: 'cover', border: '1px solid #eee' },
  leftCard: { width: 320, background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #f0f0f0', boxShadow: '0 1px 4px rgba(16,24,40,0.04)' },
  rightCard: { flex: 1, background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #f0f0f0', boxShadow: '0 1px 4px rgba(16,24,40,0.04)' },
  primaryBtn: { background: '#1976d2', color: '#fff', padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer' },
  outlineBtn: { background: 'transparent', color: '#1976d2', padding: '8px 10px', borderRadius: 8, border: '1px solid #cfe3ff', cursor: 'pointer' },
  input: { width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e6e6e6' },
  sectionTitle: { margin: '8px 0', fontSize: 16, fontWeight: 600 }
};

function StatCard({ title, value, hint }) {
  return (
    <div style={{ flex: 1, padding: 16, border: '1px solid #eee', borderRadius: 8, marginRight: 12, background: '#fff' }}>
      <div style={{ fontSize: 12, color: '#666' }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: '#999' }}>{hint}</div>}
    </div>
  );
}

function Profile() {
  const profileInputRef = useRef(null);
  const [profile, setProfile] = useState(null);
  const [editData, setEditData] = useState({ address: '', pincode: '', profile_picture: null });
  const [profilePreview, setProfilePreview] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [stats, setStats] = useState({ tickets: 0, referrals: 0 });
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [changePwdLoading, setChangePwdLoading] = useState(false);
  const [changePwdMessage, setChangePwdMessage] = useState('');

  useEffect(() => {
    fetchProfile();
    fetchStats();
  }, []);

  useEffect(() => {
    return () => {
      if (profilePreview) URL.revokeObjectURL(profilePreview);
    };
  }, [profilePreview]);

  const fetchProfile = async () => {
    try {
      const res = await userAPI.getProfile();
      setProfile(res.data.data);
      setEditData({
        address: res.data.data.address || '',
        pincode: res.data.data.pincode || '',
        profile_picture: null
      });
    } catch (err) {
      setMessage('Failed to load profile');
    }
  };

  const fetchStats = async () => {
    try {
      const [ticketsRes, referralsRes] = await Promise.all([
        ticketAPI.getMyTickets(),
        referralAPI.getMyReferrals()
      ]);
      setStats({ tickets: ticketsRes.data?.data?.length || 0, referrals: referralsRes.data?.data?.length || 0 });
    } catch (e) {
      // ignore
    }
  };

  const handleChange = (e) => {
    setEditData({ ...editData, [e.target.name]: e.target.value });
  };

  const handleProfilePic = (e) => {
    const file = e.target.files[0];
    setEditData({ ...editData, profile_picture: file });
    if (file) {
      try {
        const url = URL.createObjectURL(file);
        setProfilePreview(url);
      } catch (err) {}
    }
  };

  const validateFile = (file) => {
    if (!file) return { ok: true };
    const allowed = ['image/jpeg', 'image/jpg', 'image/png'];
    let fileType = file.type;
    if (!fileType || fileType === '') {
      const ext = (file.name || '').split('.').pop()?.toLowerCase() || '';
      if (['jpg','jpeg'].includes(ext)) fileType = 'image/jpeg';
      if (ext === 'png') fileType = 'image/png';
    }
    if (!allowed.includes(fileType)) return { ok: false, reason: 'Invalid file type (use JPG/PNG)' };
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) return { ok: false, reason: 'File too large (max 5MB)' };
    return { ok: true };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setUploadProgress(null);
    try {
      // Client-side validation
      if (editData.profile_picture) {
        const res = validateFile(editData.profile_picture);
        if (!res.ok) {
          setMessage(`Profile picture: ${res.reason}`);
          setLoading(false);
          return;
        }
      }

      const formData = new FormData();
      formData.append('address', editData.address);
      formData.append('pincode', editData.pincode);
      if (editData.profile_picture) {
        formData.append('profile_picture', editData.profile_picture);
      }

      const res = await userAPI.updateProfile(formData, (progressEvent) => {
        if (progressEvent && progressEvent.total) {
          const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(pct);
        }
      });

      setMessage('Profile updated successfully');
      // Refresh profile data
      await fetchProfile();
      // Clear local previews
      setProfilePreview(null);
      setEditData({ ...editData, profile_picture: null });
    } catch (err) {
      setMessage(err.response?.data?.message || 'Failed to update profile');
    }
    setLoading(false);
    setTimeout(() => setUploadProgress(null), 800);
  };

  if (!profile) return <div>Loading...</div>;

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <img src={profile.profile_picture_url ? `${backendURL}${profile.profile_picture_url}` : '/images/avatar-placeholder.svg'} alt="Profile" style={styles.avatarSmall} />
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>{profile.name}</h2>
          <div style={{ color: '#666', marginTop: 6 }}>{profile.email} • {profile.mobile}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        <StatCard title="Tickets Purchased" value={stats.tickets} />
        <StatCard title="Referrals" value={stats.referrals} />
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* Left panel: avatar + actions */}
        <div style={styles.leftCard}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <img src={profile.profile_picture_url ? `${backendURL}${profile.profile_picture_url}` : '/images/avatar-placeholder.svg'} alt="avatar" style={{ width: 180, height: 180, borderRadius: 12, objectFit: 'cover', border: '1px solid #eee' }} />
            <label style={{ display: 'inline-block', width: '100%' }}>
              <input ref={profileInputRef} type="file" accept="image/*" onChange={handleProfilePic} style={{ display: 'none' }} />
              <button type="button" style={{...styles.primaryBtn, width: '100%'}} onClick={() => profileInputRef.current && profileInputRef.current.click()}>Upload Photo</button>
            </label>
            <div style={{ width: '100%' }}>
              <button type="button" onClick={() => setShowChangePwd(true)} style={{...styles.outlineBtn, width: '100%'}}>Change Password</button>
            </div>
            {profilePreview ? (
              <div style={{ marginTop: 8, width: '100%' }}>
                <img src={profilePreview} alt="preview" style={{ width: '100%', borderRadius: 8, border: '1px solid #f0f0f0' }} />
              </div>
            ) : null}
          </div>
        </div>

        {/* Right panel: editable fields */}
        <div style={styles.rightCard}>
          <h3 style={{ marginTop: 0, fontSize: 18 }}>Profile Information</h3>
          
          {changePwdMessage && <div style={{ padding: 10, background: changePwdMessage.includes('success') ? '#e8f5e9' : '#ffebee', borderRadius: 6, marginBottom: 12 }}>{changePwdMessage}</div>}
          {message && <div style={{ padding: 10, background: message.includes('success') ? '#e8f5e9' : '#ffebee', borderRadius: 6, marginBottom: 12 }}>{message}</div>}

          {showChangePwd && (
            <div style={{ marginBottom: 20, padding: 16, background: '#f9f9f9', borderRadius: 8 }}>
              <h4 style={{ marginTop: 0 }}>Change Password</h4>
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>Current Password</label>
                  <input type="password" placeholder="Current password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} style={styles.input} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>New Password</label>
                  <input type="password" placeholder="New password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} style={styles.input} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>Confirm New Password</label>
                  <input type="password" placeholder="Confirm new password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} style={styles.input} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowChangePwd(false)} style={styles.outlineBtn}>Cancel</button>
                <button type="button" onClick={async () => {
                  setChangePwdMessage('');
                  if (!newPwd) { setChangePwdMessage('New password required'); return; }
                  if (newPwd !== confirmPwd) { setChangePwdMessage('Passwords do not match'); return; }
                  setChangePwdLoading(true);
                  try {
                    await userAPI.changePassword({ currentPassword: currentPwd, newPassword: newPwd });
                    setChangePwdMessage('Password changed successfully');
                    setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
                    setTimeout(() => { setShowChangePwd(false); setChangePwdMessage(''); }, 900);
                  } catch (err) {
                    setChangePwdMessage(err.response?.data?.message || 'Failed to change password');
                  }
                  setChangePwdLoading(false);
                }} style={styles.primaryBtn} disabled={changePwdLoading}>{changePwdLoading ? 'Saving...' : 'Save'}</button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} encType="multipart/form-data">
            {uploadProgress !== null && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${uploadProgress}%`, height: '100%', background: '#4caf50' }} />
                </div>
                <div style={{ fontSize: 12, color: '#444', marginTop: 6 }}>{uploadProgress}%</div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>Address</label>
                <input type="text" name="address" value={editData.address} onChange={handleChange} style={styles.input} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>Pincode</label>
                <input type="text" name="pincode" value={editData.pincode} onChange={handleChange} style={styles.input} />
              </div>
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
              <button type="submit" disabled={loading} style={styles.primaryBtn}>{loading ? 'Saving...' : 'Save Changes'}</button>
              <button type="button" onClick={() => {
                setEditData({ 
                  address: profile.address || '', 
                  pincode: profile.pincode || '',
                  profile_picture: null
                });
                setProfilePreview(null);
              }} style={styles.outlineBtn}>Reset</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Profile;

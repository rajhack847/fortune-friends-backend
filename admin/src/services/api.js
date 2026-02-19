import axios from 'axios';

// HARDCODED for production - using Render backend
const API_BASE_URL = 'https://fortune-friends-backend-1.onrender.com/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('adminToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Remove Content-Type for FormData to let axios set it with boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('adminToken');
      localStorage.removeItem('admin');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const adminAPI = {
  login: (data) => api.post('/admin/login', data),
  getDashboard: () => api.get('/admin/dashboard'),
  getLotteryEvents: () => api.get('/admin/lottery-events'),
  createLottery: (data) => api.post('/admin/lottery-events', data),
  updateLottery: (id, data) => api.patch(`/admin/lottery-events/${id}`, data),
  deleteLottery: (id) => api.delete(`/admin/lottery-events/${id}`),
  markPrizeDelivered: (winnerId, notes) => api.patch(`/admin/winners/${winnerId}/deliver`, { deliveryNotes: notes }),
  getPaymentSettings: () => api.get('/payment-settings'),
  updatePaymentSettings: (data) => api.put('/payment-settings', data),
  getHomeSettings: () => api.get('/home-settings'),
  updateHomeSettings: (data) => api.put('/home-settings', data),
  // Admin account & staff management
  getAdmins: () => api.get('/admin/accounts'),
  createAdmin: (data) => api.post('/admin/accounts', data),
  updateAdmin: (id, data) => api.patch(`/admin/accounts/${id}`, data),
  getPermissions: () => api.get('/admin/accounts/permissions'),
  deleteAdmin: (id) => api.delete(`/admin/accounts/${id}`),
  changeMyPassword: (data) => api.post('/admin/change-password', data),
  // User management
  getUsers: (params) => api.get('/admin/users', { params }),
  getUserById: (id) => api.get(`/admin/users/${id}`),
  createUser: (data) => api.post('/admin/users', data),
  updateUser: (id, data) => api.put(`/admin/users/${id}`, data),
  toggleUserStatus: (id) => api.post(`/admin/users/${id}/status`),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  // Top referrers
  getTopReferrers: (params) => api.get('/admin/top-referrers', { params }),
  getTopReferrersSample: () => api.get('/admin/top-referrers-sample')
};

export const paymentAPI = {
  getPending: () => api.get('/payments/pending'),
  verify: (paymentId, status, rejectionReason) => api.patch(`/payments/${paymentId}/verify`, { status, rejectionReason })
};

export const fortuneDrawAPI = {
  drawWinner: (fortuneDrawEventId) => api.post(`/fortune-draw/${fortuneDrawEventId}/draw`),
  getWinners: (fortuneDrawEventId) => api.get(`/fortune-draw/winners${fortuneDrawEventId ? `?fortuneDrawEventId=${fortuneDrawEventId}` : ''}`)
};

export const referralAPI = {
  getTree: (userId) => api.get(`/referrals/tree/${userId}`)
};

export default api;

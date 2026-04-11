import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
})

// Inject bearer token from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('citysync_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-refresh token from response.
// On 401 (expired/invalid token): clear it and RETRY the request anonymously
// so the citizen never sees a confusing "token" error.
api.interceptors.response.use((response) => {
  const newToken = response.data?.bearer_token
  if (newToken) localStorage.setItem('citysync_token', newToken)
  return response
}, async (error) => {
  const originalRequest = error.config
  if (error.response?.status === 401 && !originalRequest._retried) {
    // Clear the stale/expired token and retry without auth header
    localStorage.removeItem('citysync_token')
    originalRequest._retried = true
    delete originalRequest.headers['Authorization']
    return api(originalRequest)
  }
  return Promise.reject(error)
})

// ── Complaint APIs ─────────────────────────────────────────────────────────────
export const submitComplaint = (payload) => api.post('/api/submit', payload)
export const getTicket       = (ticketId) => api.get(`/api/tickets/${ticketId}`)
export const listTickets     = (params)   => api.get('/api/tickets', { params })
export const assignTicket    = (ticketId, assigneeId) =>
  api.post(`/api/tickets/${ticketId}/assign`, { assignee_id: assigneeId })
export const listFieldWorkers = () => api.get('/api/field-workers')
export const upvoteTicket    = (ticketId) => api.post(`/api/upvote?ticket_id=${ticketId}`)

// ── Verification APIs ──────────────────────────────────────────────────────────
export const getVerificationStatus = (ticketId) => api.get(`/api/verify/${ticketId}`)
export const submitStep2           = (payload)  => api.post('/api/verify/step2', payload)

// ── Metrics APIs ───────────────────────────────────────────────────────────────
export const getMetrics     = () => api.get('/api/stats/gateway')
export const getLeaderboard = () => api.get('/api/frequency/leaderboard')
export const getRoutingMetrics = () =>
  axios.get(`${import.meta.env.VITE_ROUTING_URL || 'http://localhost:8001'}/api/stats/routing`, { timeout: 5000 }).catch(() => ({ data: {} }))
export const getVerifyMetrics = () =>
  axios.get(`${import.meta.env.VITE_VERIFY_URL || 'http://localhost:8002'}/api/stats/verify`, { timeout: 5000 }).catch(() => ({ data: {} }))

// ── Demo ───────────────────────────────────────────────────────────────────────
export const getDemoTokens = () => api.get('/api/demo-tokens')
export const getMe = () => api.get('/api/me')

export default api

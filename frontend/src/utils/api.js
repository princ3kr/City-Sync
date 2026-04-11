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

// Auto-refresh token from response
api.interceptors.response.use((response) => {
  const newToken = response.data?.bearer_token
  if (newToken) localStorage.setItem('citysync_token', newToken)
  return response
})

// ── Complaint APIs ─────────────────────────────────────────────────────────────
export const submitComplaint = (payload) => api.post('/api/submit', payload)
export const getTicket       = (ticketId) => api.get(`/api/tickets/${ticketId}`)
export const listTickets     = (params)   => api.get('/api/tickets', { params })
export const upvoteTicket    = (ticketId) => api.post(`/api/upvote?ticket_id=${ticketId}`)

// ── Verification APIs ──────────────────────────────────────────────────────────
const VERIFY_URL = import.meta.env.VITE_VERIFY_URL || 'http://localhost:8002'
export const getVerificationStatus = (ticketId) => api.get(`${VERIFY_URL}/api/verify/${ticketId}`)
export const submitStep2           = (payload)  => api.post(`${VERIFY_URL}/api/verify/step2`, payload)

// ── Metrics APIs ───────────────────────────────────────────────────────────────
export const getMetrics     = () => api.get('/api/metrics')
export const getLeaderboard = () => api.get('/api/frequency/leaderboard')
export const getRoutingMetrics = () =>
  axios.get(`${import.meta.env.VITE_ROUTING_URL || 'http://localhost:8001'}/api/routing/metrics`, { timeout: 5000 }).catch(() => ({ data: {} }))
export const getVerifyMetrics = () =>
  axios.get(`${import.meta.env.VITE_VERIFY_URL || 'http://localhost:8002'}/api/verify/metrics`, { timeout: 5000 }).catch(() => ({ data: {} }))

// ── Demo ───────────────────────────────────────────────────────────────────────
export const getDemoTokens = () => api.get('/api/demo-tokens')

// ── Department Portal APIs ────────────────────────────────────────────────────
const DEPT_PORTAL_URL = 'http://localhost:3000'
export const getDeptStats      = () => axios.get(`${DEPT_PORTAL_URL}/api/stats`)
export const getDeptTickets    = () => axios.get(`${DEPT_PORTAL_URL}/api/tickets`)
export const getDeptWebhookLog = () => axios.get(`${DEPT_PORTAL_URL}/api/webhook-log`)

export default api

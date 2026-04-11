import React, { useState, useEffect, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Map, Search, AlertCircle, Heart, CheckCircle2, Sun, Moon } from 'lucide-react'
import CitizenPortal from './components/CitizenPortal'
import OfficerMap from './components/OfficerMap'
import AdminDashboard from './components/AdminDashboard'
import DeptPortal from './components/DeptPortal'
import StatusTimeline from './components/StatusTimeline'
import VerificationPanel from './components/VerificationPanel'
import { useSocket } from './hooks/useSocket'
import { getDemoTokens } from './utils/api'

// ── Theme Context ──────────────────────────────────────────────────────────────
const ThemeContext = createContext()

export function useTheme() {
  return useContext(ThemeContext)
}

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('citysync_theme')
    if (saved) return saved
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('citysync_theme', theme)
    // Update meta theme-color
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.content = theme === 'dark' ? '#060a12' : '#f8fafc'
  }, [theme])

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark')

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

// ── Toast Notifications ────────────────────────────────────────────────────────
function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000)
    return () => clearTimeout(t)
  }, [onClose])

  const icons = {
    info: <AlertCircle size={18} />,
    success: <CheckCircle2 size={18} color="var(--tier-low)" />,
    error: <AlertCircle size={18} color="var(--tier-critical)" />,
    warning: <AlertCircle size={18} color="var(--tier-high)" />
  }

  return (
    <motion.div
      initial={{ x: 100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 100, opacity: 0 }}
      className={`toast toast-${type}`}
    >
      <span className="flex-center" style={{ width: 24, flexShrink: 0 }}>{icons[type]}</span>
      <div style={{ flex: 1, fontSize: '0.85rem', fontWeight: 500 }}>{message}</div>
      <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ padding: 4 }}>✕</button>
    </motion.div>
  )
}

function ToastContainer({ toasts, removeToast }) {
  return (
    <div className="toast-container">
      <AnimatePresence>
        {toasts.map(t => <Toast key={t.id} {...t} onClose={() => removeToast(t.id)} />)}
      </AnimatePresence>
    </div>
  )
}

// ── Navigation ─────────────────────────────────────────────────────────────────
function Nav({ role, setRole, onAddToast }) {
  const { theme, toggleTheme } = useTheme()

  const changeRole = async (r) => {
    try {
      const { data } = await getDemoTokens()
      const tokenForRole = {
        citizen: data.citizen,
        officer: data.officer,
        admin: data.admin,
        dept_swd: data.dept_swd,
        dept_roads: data.dept_roads,
        dept_fire: data.dept_fire,
      }[r]
      if (tokenForRole) localStorage.setItem('citysync_token', tokenForRole)
    } catch {
      /* gateway offline — keep existing token */
    }
    setRole(r)
    localStorage.setItem('citysync_role', r)
    onAddToast({ message: `Switched to ${r} view`, type: 'info' })
  }

  const roleLevel = {
    citizen: 0,
    officer: 1,
    dept_swd: 1,
    dept_roads: 1,
    dept_fire: 1,
    admin: 2
  }[role] || 0

  return (
    <nav className="nav">
      <div className="nav-inner">
        <NavLink to="/" className="nav-logo" style={{ textDecoration: 'none' }}>
          <motion.div
            whileHover={{ rotate: 15, scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className="nav-logo-icon"
          >
            🏙️
          </motion.div>
          <span style={{ letterSpacing: '-0.02em' }}>
            CITY<span style={{ color: 'var(--neon-blue)' }}>SYNC</span>
          </span>
        </NavLink>

        <div className="nav-links">
          <NavLink to="/" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} end>
            🚨 Report
          </NavLink>
          <NavLink to="/track" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            🔍 Track
          </NavLink>
          {roleLevel >= 1 && (
            <NavLink to="/officer" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              🗺 Map
            </NavLink>
          )}
          {roleLevel >= 1 && (
            <NavLink to="/department" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              🏢 Dept
            </NavLink>
          )}
          {roleLevel >= 2 && (
            <NavLink to="/admin" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              📊 Admin
            </NavLink>
          )}
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {/* Theme Toggle */}
          <motion.button
            className="theme-toggle"
            onClick={toggleTheme}
            whileTap={{ scale: 0.9, rotate: 180 }}
            whileHover={{ scale: 1.1 }}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            <AnimatePresence mode="wait">
              {theme === 'dark' ? (
                <motion.div key="sun" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
                  <Sun size={18} />
                </motion.div>
              ) : (
                <motion.div key="moon" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.2 }}>
                  <Moon size={18} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>

          {/* Role switcher for demo */}
          {(() => {
            const isOfficer = role === 'officer' || role.startsWith('dept_')
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', paddingRight: 4 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: '0.70rem', color: 'var(--text-muted)', fontWeight: 600 }}>DEMO:</span>
                  {[
                    { id: 'citizen', label: 'Citizen' },
                    { id: 'officer', label: 'Officer' },
                    { id: 'admin', label: 'Admin' },
                  ].map(({ id, label }) => (
                    <button
                      key={id}
                      className={`btn btn-sm ${((id === 'officer' && isOfficer) || role === id) ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ padding: '4px 10px', fontSize: '0.68rem', borderRadius: 'var(--radius-sm)' }}
                      onClick={() => changeRole(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {isOfficer && (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--accent-blue)', fontWeight: 600 }}>SCOPE:</span>
                    {[
                      { id: 'officer', label: 'City-wide' },
                      { id: 'dept_fire', label: 'Fire' },
                      { id: 'dept_swd', label: 'SWD' },
                      { id: 'dept_roads', label: 'Roads' },
                    ].map(({ id, label }) => (
                      <button
                        key={id}
                        className={`btn btn-sm ${role === id ? 'btn-primary' : 'btn-outline'}`}
                        style={{ padding: '2px 8px', fontSize: '0.62rem', height: 'auto', minHeight: 0, borderRadius: 'var(--radius-sm)' }}
                        onClick={() => changeRole(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      </div>
    </nav>
  )
}

// ── Pages ──────────────────────────────────────────────────────────────────────
function HomePage({ onAddToast }) {
  const [submitted, setSubmitted] = useState(null)
  const { theme } = useTheme()

  return (
    <div>
      {/* ── Hero ──────────────────────────────────────────────────────────────── */}
      <section className="hero" style={{ paddingTop: 80, paddingBottom: 60 }}>
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="hero-eyebrow"
        >
          <span className="status-dot live" style={{ background: 'var(--neon-blue)' }} />
          LIVE CITY MONITORING
        </motion.div>

        <motion.h1
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.6 }}
          className="hero-title"
        >
          Better Cities,{' '}
          <span className="highlight">Together.</span>
        </motion.h1>

        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="hero-subtitle"
          style={{ maxWidth: 580, margin: '0 auto 40px' }}
        >
          See a problem? Snap a photo and we'll fix it.
          CitySync automatically sends your report to the right people.
          <span style={{ display: 'block', marginTop: 12, fontWeight: 700, color: 'var(--text-heading)' }}>
            No forms. No hassle. Just results.
          </span>
        </motion.p>

        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="hero-actions"
        >
          <a href="#submit" className="btn btn-primary btn-lg animate-glow">🚨 Start Report</a>
          <a href="#how" className="btn btn-outline btn-lg">How It Works</a>
        </motion.div>
      </section>

      {/* ── Feature Cards ─────────────────────────────────────────────────────── */}
      <section id="how" style={{ padding: '60px 24px' }}>
        <div className="container" style={{ display: 'flex', gap: 20, overflowX: 'auto', paddingBottom: 20 }}>
          {[
            { icon: <Shield size={22} color="var(--neon-blue)" />, title: 'Identity Secret', desc: 'Secure & Anonymous' },
            { icon: <Map size={22} color="var(--neon-purple)" />, title: 'Smart Routing', desc: 'Directly to Officials' },
            { icon: <Search size={22} color="var(--accent-teal)" />, title: 'Real-time Track', desc: 'Know when it\'s fixed' },
            { icon: <Heart size={22} color="var(--neon-pink)" />, title: 'Civic Love', desc: 'Built for our City' },
          ].map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08 }}
              viewport={{ once: true }}
              className="card card-sm flex items-center gap-16"
              style={{ minWidth: 240, flexShrink: 0, cursor: 'default' }}
            >
              <div className="flex-center" style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--bg-elevated)', flexShrink: 0 }}>
                {item.icon}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{item.title}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Submit Section ────────────────────────────────────────────────────── */}
      <section id="submit" style={{ padding: '80px 24px', background: 'var(--bg-surface)', transition: 'background 0.4s ease' }}>
        <div className="container-narrow">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            style={{ textAlign: 'center', marginBottom: 48 }}
          >
            <h2 className="mb-8">Easy Reporting</h2>
            <p>Tell the city what needs attention in 3 quick steps.</p>
          </motion.div>

          <div className="card" style={{ padding: 24, border: '1px solid var(--neon-border)' }}>
            <CitizenPortal onSubmitted={(data) => {
              setSubmitted(data)
              onAddToast({ message: `✅ Reported! Ticket ID: ${data.ticket_id}`, type: 'success' })
            }} />
          </div>

          {/* Redundant status removed; handled within CitizenPortal success state */}
        </div>
      </section>
    </div>
  )
}

function TrackPage() {
  const [ticketId, setTicketId] = useState('')
  const [tracking, setTracking] = useState(null)
  const [ticketStatus, setTicketStatus] = useState(null)

  const handleTrack = () => {
    const id = ticketId.trim().toUpperCase()
    if (id) setTracking(id)
  }

  return (
    <div className="container" style={{ padding: '80px 24px' }}>
      <h2 className="mb-8">Track Your Ticket</h2>
      <p className="mb-32">Enter your ticket ID to see what's happening.</p>

      <div style={{ display: 'flex', gap: 12, maxWidth: 500, marginBottom: 40 }}>
        <input
          className="input"
          placeholder="TKT-XXXXXX"
          value={ticketId}
          onChange={e => setTicketId(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && ticketId.trim() && handleTrack()}
          style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.05em' }}
        />
        <button
          className="btn btn-primary"
          onClick={handleTrack}
          disabled={!ticketId.trim()}
        >
          Track
        </button>
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 32 }}>
        Tip: Your ticket ID was shown after submitting a complaint. It starts with <code style={{ fontFamily: 'monospace', background: 'var(--bg-card)', padding: '1px 6px', borderRadius: 4 }}>TKT-</code>
      </p>

      <AnimatePresence>
        {tracking && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="grid-2" style={{ gap: 24 }}>
              <div className="card">
                <StatusTimeline ticketId={tracking} onStatusChange={setTicketStatus} />
              </div>
              <div className="card">
                <VerificationPanel ticketId={tracking} mode="citizen" currentStatus={ticketStatus} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Root App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [toasts, setToasts] = useState([])
  const [role, setRole] = useState(localStorage.getItem('citysync_role') || 'citizen')
  let toastId = 0

  const addToast = ({ message, type = 'info' }) => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, message, type }])
  }
  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id))

  // ── Demo tokens: align JWT with saved DEMO ROLE (officer map dispatch, etc.)
  useEffect(() => {
    getDemoTokens()
      .then((res) => {
        const data = res.data || {}
        const storedRole = localStorage.getItem('citysync_role') || 'citizen'
        const forRole = {
          citizen: data.citizen,
          officer: data.officer,
          admin: data.admin,
          dept_swd: data.dept_swd,
          dept_roads: data.dept_roads,
          dept_fire: data.dept_fire,
        }[storedRole]
        if (forRole) localStorage.setItem('citysync_token', forRole)
      })
      .catch(() => {})
  }, [])

  const { lastEvent } = useSocket()
  useEffect(() => {
    if (!lastEvent) return
    if (lastEvent.type === 'priority.boost') {
      addToast({ message: `⚡ High Priority! Ticket ${lastEvent.data.ticket_id}`, type: 'warning' })
    } else if (lastEvent.type === 'resolution.confirmed') {
      addToast({ message: `✅ Issue Solved! ${lastEvent.data.ticket_id}`, type: 'success' })
    }
  }, [lastEvent])

  const roleLevel = {
    citizen: 0,
    officer: 1,
    dept_swd: 1,
    dept_roads: 1,
    dept_fire: 1,
    admin: 2
  }[role] || 0

  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="app-layout">
          <Nav role={role} setRole={setRole} onAddToast={addToast} />
          <main className="page-content">
            <Routes>
              <Route path="/" element={<HomePage onAddToast={addToast} />} />
              <Route path="/track" element={<TrackPage />} />
              <Route path="/officer" element={roleLevel >= 1 ? <div className="container" style={{ padding: '40px 24px' }}><OfficerMap /></div> : <div className="container text-center pt-32">Access Denied</div>} />
              <Route path="/department" element={roleLevel >= 1 ? <DeptPortal /> : <div className="container text-center pt-32">Access Denied</div>} />
              <Route path="/admin" element={roleLevel >= 2 ? <div className="container" style={{ padding: '40px 24px' }}><AdminDashboard /></div> : <div className="container text-center pt-32">Access Denied</div>} />
            </Routes>
          </main>
        </div>
        <ToastContainer toasts={toasts} removeToast={removeToast} />
      </BrowserRouter>
    </ThemeProvider>
  )
}

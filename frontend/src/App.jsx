import React, { useState, useEffect, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Map, Search, AlertCircle, Heart, CheckCircle2, Sun, Moon } from 'lucide-react'
import CitizenPortal from './components/CitizenPortal'
import OfficerMap from './components/OfficerMap'
import AdminDashboard from './components/AdminDashboard'
import StatusTimeline from './components/StatusTimeline'
import VerificationPanel from './components/VerificationPanel'
import { useSocket } from './hooks/useSocket'

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
function Nav({ onAddToast }) {
  const { theme, toggleTheme } = useTheme()
  const [role, setRole] = useState(localStorage.getItem('citysync_role') || 'citizen')

  const changeRole = (r) => {
    setRole(r)
    localStorage.setItem('citysync_role', r)
    onAddToast({ message: `Switched to ${r} view`, type: 'info' })
  }

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
          {role !== 'citizen' && (
            <>
              <NavLink to="/officer" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                🗺 Map
              </NavLink>
              <NavLink to="/admin" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                📊 Admin
              </NavLink>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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

          {/* Role Selector */}
          <select
            value={role}
            onChange={(e) => changeRole(e.target.value)}
            className="select"
            style={{
              width: 'auto', fontSize: '0.7rem', padding: '4px 10px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', cursor: 'pointer'
            }}
          >
            <option value="citizen">👤 Citizen</option>
            <option value="officer">🛡️ Officer</option>
            <option value="admin">⚙️ Admin</option>
          </select>
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

          {submitted && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              style={{ marginTop: 40 }}
            >
              <h3 className="mb-16">Live Status</h3>
              <StatusTimeline ticketId={submitted.ticket_id} />
            </motion.div>
          )}
        </div>
      </section>
    </div>
  )
}

function TrackPage() {
  const [ticketId, setTicketId] = useState('')
  const [tracking, setTracking] = useState(null)

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
          style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.05em' }}
        />
        <button
          className="btn btn-primary"
          onClick={() => setTracking(ticketId)}
          disabled={!ticketId.startsWith('TKT-')}
        >
          Track
        </button>
      </div>

      <AnimatePresence>
        {tracking && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="grid-2" style={{ gap: 24 }}>
              <div className="card"><StatusTimeline ticketId={tracking} /></div>
              <div className="card"><VerificationPanel ticketId={tracking} mode="citizen" /></div>
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
  const [toastCounter, setToastCounter] = useState(0)

  const addToast = ({ message, type = 'info' }) => {
    const id = toastCounter
    setToastCounter(prev => prev + 1)
    setToasts(prev => [...prev, { id, message, type }])
  }
  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id))

  const { lastEvent } = useSocket()
  useEffect(() => {
    if (!lastEvent) return
    if (lastEvent.type === 'priority.boost') {
      addToast({ message: `⚡ High Priority! Ticket ${lastEvent.data.ticket_id}`, type: 'warning' })
    } else if (lastEvent.type === 'resolution.confirmed') {
      addToast({ message: `✅ Issue Solved! ${lastEvent.data.ticket_id}`, type: 'success' })
    }
  }, [lastEvent])

  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="app-layout">
          <Nav onAddToast={addToast} />
          <main className="page-content">
            <Routes>
              <Route path="/" element={<HomePage onAddToast={addToast} />} />
              <Route path="/track" element={<TrackPage />} />
              <Route path="/officer" element={<div className="container" style={{ padding: '40px 24px' }}><OfficerMap /></div>} />
              <Route path="/admin" element={<div className="container" style={{ padding: '40px 24px' }}><AdminDashboard /></div>} />
            </Routes>
          </main>
        </div>
        <ToastContainer toasts={toasts} removeToast={removeToast} />
      </BrowserRouter>
    </ThemeProvider>
  )
}

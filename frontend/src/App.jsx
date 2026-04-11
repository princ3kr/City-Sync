import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, zap, Map, BarChart3, Search, AlertCircle, Heart, CheckCircle2 } from 'lucide-react'
import CitizenPortal from './components/CitizenPortal'
import OfficerMap from './components/OfficerMap'
import AdminDashboard from './components/AdminDashboard'
import StatusTimeline from './components/StatusTimeline'
import VerificationPanel from './components/VerificationPanel'
import { useSocket } from './hooks/useSocket'

// ── Toast Notifications ────────────────────────────────────────────────────────
function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000)
    return () => clearTimeout(t)
  }, [onClose])

  const icons = { 
    info: <AlertCircle size={18} />, 
    success: <CheckCircle2 size={18} />, 
    error: <AlertCircle size={18} color="var(--tier-critical)" />, 
    warning: <AlertCircle size={18} /> 
  }

  return (
    <motion.div 
      initial={{ x: 100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 100, opacity: 0 }}
      className={`toast toast-${type}`}
    >
      <span className="flex-center" style={{ width: 24 }}>{icons[type]}</span>
      <div style={{ flex: 1, fontSize: '0.85rem', fontWeight: 500 }}>{message}</div>
      <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ padding: 4 }}>✕</button>
    </motion.div>
  )
}

function ToastContainer({ toasts, removeToast }) {
  return (
    <div className="toast-container" style={{ zIndex: 1000 }}>
      <AnimatePresence>
        {toasts.map(t => <Toast key={t.id} {...t} onClose={() => removeToast(t.id)} />)}
      </AnimatePresence>
    </div>
  )
}

// ── Navigation ─────────────────────────────────────────────────────────────────
function Nav({ onAddToast }) {
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
            whileHover={{ rotate: 15 }}
            className="nav-logo-icon"
            style={{ background: 'var(--grad-neon)', boxShadow: 'var(--neon-glow)' }}
          >
            🏙️
          </motion.div>
          <span style={{ letterSpacing: '-0.02em', fontWeight: 800 }}>CITY<span style={{ color: 'var(--neon-blue)' }}>SYNC</span></span>
        </NavLink>

        <div className="nav-links">
          <NavLink to="/" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} end>
            Report
          </NavLink>
          <NavLink to="/track" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Track
          </NavLink>
          {role !== 'citizen' && (
            <>
              <NavLink to="/officer" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                Map
              </NavLink>
              <NavLink to="/admin" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                Admin
              </NavLink>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', opacity: 0.6 }}>
          <select 
            value={role} 
            onChange={(e) => changeRole(e.target.value)}
            className="select btn-sm"
            style={{ width: 'auto', fontSize: '0.65rem', border: 'none', background: 'var(--bg-elevated)', padding: '2px 8px' }}
          >
            <option value="citizen">Citizen</option>
            <option value="officer">Officer</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
    </nav>
  )
}

// ── Pages ──────────────────────────────────────────────────────────────────────
function HomePage({ onAddToast }) {
  const [submitted, setSubmitted] = useState(null)

  return (
    <div>
      <section className="hero" style={{ paddingTop: 80, paddingBottom: 60 }}>
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="hero-eyebrow"
          style={{ background: 'rgba(0, 210, 255, 0.1)', color: 'var(--neon-blue)', border: '1px solid var(--neon-border)' }}
        >
          <span className="status-dot live" style={{ background: 'var(--neon-blue)' }} />
          LIVE CITY MONITORING ACTIVE
        </motion.div>
        
        <motion.h1 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="hero-title"
        >
          Better Cities, <span style={{ color: 'var(--neon-blue)', textShadow: '0 0 20px rgba(0, 210, 255, 0.3)' }}>Together.</span>
        </motion.h1>
        
        <motion.p 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="hero-subtitle"
          style={{ maxWidth: 600, margin: '0 auto 40px' }}
        >
          See a problem? Snap a photo and we'll fix it. 
          CitySync automatically sends your report to the right people. 
          <span style={{ display: 'block', marginTop: 12, fontWeight: 600, color: 'var(--text-primary)' }}>No forms. No hassle. Just results.</span>
        </motion.p>
        
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="hero-actions"
        >
          <a href="#submit" className="btn btn-primary btn-lg animate-glow">🚨 Start Report</a>
          <a href="#how" className="btn btn-outline btn-lg">Watch Video</a>
        </motion.div>
      </section>

      {/* Feature Icons */}
      <section style={{ padding: '0 24px 60px' }}>
        <div className="container" style={{ display: 'flex', gap: 24, overflowX: 'auto', paddingBottom: 20 }}>
          {[
            { icon: <Shield size={24} color="var(--neon-blue)"/>, title: 'Identity Secret', desc: 'Secure & Anonymous' },
            { icon: <Map size={24} color="var(--neon-purple)"/>, title: 'Smart Routing', desc: 'Directly to Officials' },
            { icon: <Search size={24} color="var(--neon-pink)"/>, title: 'Real-time Track', desc: 'Know when it\'s fixed' },
            { icon: <Heart size={24} color="#f43f5e"/>, title: 'Civic Love', desc: 'Built for our Community' },
          ].map((item, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="card card-sm flex items-center gap-16"
              style={{ minWidth: 260, flexShrink: 0 }}
            >
              <div className="flex-center" style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--bg-elevated)' }}>
                {item.icon}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{item.title}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Submit Section */}
      <section id="submit" style={{ padding: '80px 24px', background: 'var(--bg-surface)' }}>
        <div className="container-narrow">
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 className="mb-8">Easy Reporting</h2>
            <p>Tell the city what needs attention in 3 quick steps.</p>
          </div>

          <div className="card animate-glow" style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--neon-border)' }}>
            <CitizenPortal onSubmitted={(data) => {
              setSubmitted(data)
              onAddToast({ message: `✅ Reported! Ticket ID: ${data.ticket_id}`, type: 'success' })
            }} />
          </div>

          {submitted && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} style={{ marginTop: 40 }}>
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
          style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '0.05em' }}
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
      addToast({ message: `High Priority! Ticket ${lastEvent.data.ticket_id}`, type: 'warning' })
    } else if (lastEvent.type === 'resolution.confirmed') {
      addToast({ message: `✅ Issue Solved! ${lastEvent.data.ticket_id}`, type: 'success' })
    }
  }, [lastEvent])

  return (
    <BrowserRouter>
      <div className="app-layout">
        <Nav onAddToast={addToast} />
        <main className="page-content">
          <Routes>
            <Route path="/"        element={<HomePage onAddToast={addToast} />} />
            <Route path="/track"   element={<TrackPage />} />
            <Route path="/officer" element={<div className="container" style={{ padding: '40px 24px' }}><OfficerMap /></div>} />
            <Route path="/admin"   element={<div className="container" style={{ padding: '40px 24px' }}><AdminDashboard /></div>} />
          </Routes>
        </main>
      </div>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </BrowserRouter>
  )
}

import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom'
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

  const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' }
  return (
    <div className={`toast toast-${type}`}>
      <span>{icons[type]}</span>
      <div style={{ flex: 1, fontSize: '0.85rem' }}>{message}</div>
      <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
    </div>
  )
}

function ToastContainer({ toasts, removeToast }) {
  return (
    <div className="toast-container">
      {toasts.map(t => <Toast key={t.id} {...t} onClose={() => removeToast(t.id)} />)}
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
          <div className="nav-logo-icon">🏙️</div>
          CitySync
        </NavLink>

        <div className="nav-links">
          <NavLink
            to="/"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            end
          >
            🚨 Report
          </NavLink>
          <NavLink
            to="/track"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            🔍 Track
          </NavLink>
          <NavLink
            to="/officer"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            🗺 Officer Map
          </NavLink>
          <NavLink
            to="/admin"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            📊 Admin
          </NavLink>
        </div>

        {/* Role switcher for demo */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>DEMO ROLE:</span>
          {['citizen', 'officer', 'admin'].map(r => (
            <button
              key={r}
              className={`btn btn-sm ${role === r ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding: '4px 10px', fontSize: '0.72rem' }}
              onClick={() => changeRole(r)}
            >
              {r}
            </button>
          ))}
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
      {/* Hero */}
      <section className="hero">
        <div className="hero-eyebrow">
          <span className="status-dot live" style={{ background: '#22c55e' }} />
          AI-Powered Civic Intelligence Platform
        </div>
        <h1 className="hero-title">
          Report. Track. <span className="highlight">Verify.</span>
        </h1>
        <p className="hero-subtitle">
          CitySync routes your civic complaints to the right municipal department instantly —
          with AI classification, real-time tracking, and two-step verification before closure.
        </p>
        <div className="hero-actions">
          <a href="#submit" className="btn btn-primary btn-lg">🚨 Report an Issue</a>
          <a href="#how" className="btn btn-outline btn-lg">How It Works</a>
        </div>
      </section>

      {/* Feature Pills */}
      <section style={{ padding: '24px', borderBottom: '1px solid var(--border)' }}>
        <div className="container" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          {[
            ['🤖', '~380ms AI', 'gpt-4o-mini classification'],
            ['📍', '50m Dedup', 'PostGIS cluster engine'],
            ['🔒', 'Privacy Vault', 'HMAC + DP noise'],
            ['🔐', '2-Step Verify', 'PG trigger enforcement'],
            ['⚡', 'Real-time', 'Socket.io + Redis Streams'],
            ['🗺', 'Ward Routing', 'O(1) lookup table'],
          ].map(([icon, title, sub]) => (
            <div key={title} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 16px', borderRadius: 'var(--radius-full)',
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              fontSize: '0.85rem',
            }}>
              <span>{icon}</span>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>{title}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section id="how" style={{ padding: '60px 24px' }}>
        <div className="container">
          <h2 style={{ textAlign: 'center', marginBottom: 8 }}>How It Works</h2>
          <p style={{ textAlign: 'center', marginBottom: 40 }}>7 architectural layers, end-to-end in ~420ms</p>

          <div className="grid-4">
            {[
              { step: '01', icon: '📷', title: 'Capture & Submit', desc: 'Photo + description. EXIF stripped, GPS fuzzed. 202 in 140ms.' },
              { step: '02', icon: '🤖', title: 'AI Classification', desc: 'gpt-4o-mini: intent + category + severity. PostGIS ward lookup + 50m dedup.' },
              { step: '03', icon: '🏢', title: 'Smart Routing',    desc: 'HMAC-signed webhook to correct department. Retry queue if fails.' },
              { step: '04', icon: '✅', title: 'Verified Close',   desc: 'Field photo + citizen confirm. PG trigger blocks Resolved without both.' },
            ].map(card => (
              <div key={card.step} className="card" style={{ textAlign: 'center' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 'var(--radius-md)',
                  background: 'var(--grad-accent)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '1.4rem', margin: '0 auto 16px',
                }}>
                  {card.icon}
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                  STEP {card.step}
                </div>
                <h3 style={{ fontSize: '1rem', marginBottom: 8 }}>{card.title}</h3>
                <p style={{ fontSize: '0.82rem' }}>{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Submit Form */}
      <section id="submit" style={{ padding: '0 24px 60px' }}>
        <div className="container-narrow">
          <h2 style={{ textAlign: 'center', marginBottom: 8 }}>Submit a Complaint</h2>
          <p style={{ textAlign: 'center', marginBottom: 32 }}>
            AI will classify and route it to the correct department automatically
          </p>

          {submitted ? (
            <div>
              <CitizenPortal onSubmitted={setSubmitted} />
              <div style={{ marginTop: 32 }}>
                <h3 style={{ marginBottom: 16 }}>Track Your Ticket</h3>
                <StatusTimeline ticketId={submitted.ticket_id} />
              </div>
            </div>
          ) : (
            <CitizenPortal onSubmitted={data => {
              setSubmitted(data)
              onAddToast({ message: `✅ Ticket ${data.ticket_id} submitted!`, type: 'success' })
            }} />
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
    <div className="container" style={{ padding: '40px 24px' }}>
      <h2 style={{ marginBottom: 8 }}>Track Your Complaint</h2>
      <p style={{ marginBottom: 32 }}>Enter your ticket ID to see real-time status and updates.</p>

      <div style={{ display: 'flex', gap: 12, maxWidth: 500, marginBottom: 32 }}>
        <input
          className="input"
          placeholder="TKT-XXXXXXXXXX"
          value={ticketId}
          onChange={e => setTicketId(e.target.value.toUpperCase())}
          style={{ fontFamily: 'monospace', fontWeight: 600 }}
        />
        <button
          className="btn btn-primary"
          onClick={() => setTracking(ticketId)}
          disabled={!ticketId.startsWith('TKT-') || ticketId.length < 14}
        >
          Track
        </button>
      </div>

      {tracking && (
        <div style={{ maxWidth: 600 }}>
          <StatusTimeline ticketId={tracking} />
          <div style={{ marginTop: 24 }}>
            <VerificationPanel ticketId={tracking} mode="citizen" />
          </div>
        </div>
      )}
    </div>
  )
}

function OfficerPage() {
  return (
    <div className="container" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Officer Dashboard</h2>
          <p style={{ fontSize: '0.875rem' }}>Real-time complaint map · Sorted by priority score</p>
        </div>
        <div style={{ padding: '6px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-full)', fontSize: '0.78rem', color: '#ef4444' }}>
          🔒 Officer View · GPS ±30m fuzzed · No PII visible
        </div>
      </div>
      <OfficerMap />
    </div>
  )
}

// ── Root App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [toasts, setToasts] = useState([])
  let toastId = 0

  const addToast = ({ message, type = 'info' }) => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, message, type }])
  }
  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id))

  // Global real-time events → show toasts
  const { lastEvent } = useSocket()
  useEffect(() => {
    if (!lastEvent) return
    if (lastEvent.type === 'priority.boost') {
      addToast({ message: `Priority boosted for ${lastEvent.data.ticket_id}`, type: 'info' })
    } else if (lastEvent.type === 'resolution.confirmed') {
      addToast({ message: `✅ Ticket ${lastEvent.data.ticket_id} resolved!`, type: 'success' })
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
            <Route path="/officer" element={<OfficerPage />} />
            <Route path="/admin"   element={<div className="container" style={{ padding: '24px' }}><AdminDashboard /></div>} />
          </Routes>
        </main>
      </div>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </BrowserRouter>
  )
}

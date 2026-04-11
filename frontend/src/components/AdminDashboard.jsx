import React, { useState, useEffect } from 'react'
import { getMetrics, getLeaderboard, getRoutingMetrics, getVerifyMetrics, listTickets } from '../utils/api'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts'

const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#14b8a6', '#eab308', '#f97316', '#ef4444', '#22c55e', '#a855f7', '#ec4899']

function MetricCard({ label, value, unit = '', sublabel, trend, color = 'var(--accent-blue)' }) {
  return (
    <div className="card stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ background: 'none', WebkitTextFillColor: color, color }}>
        {value}<span style={{ fontSize: '1rem', opacity: 0.6 }}>{unit}</span>
      </div>
      {sublabel && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{sublabel}</div>}
      {trend != null && (
        <div className={`stat-change ${trend >= 0 ? 'stat-up' : 'stat-down'}`}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
        </div>
      )}
    </div>
  )
}

const CUSTOM_TOOLTIP = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="card card-sm" style={{ fontSize: '0.8rem', padding: '8px 12px' }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>{p.name}: {p.value}</div>
      ))}
    </div>
  )
}

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [routingMetrics, setRoutingMetrics] = useState(null)
  const [verifyMetrics, setVerifyMetrics] = useState(null)
  const [ticketsByStatus, setTicketsByStatus] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(null)
  // Track which backend services are reachable
  const [serviceHealth, setServiceHealth] = useState({
    gateway: 'checking',
    routing: 'checking',
    verification: 'checking',
  })

  const fetchAll = async () => {
    try {
      // Run all fetches independently so one failure doesn't block others
      const [mResult, lbResult, rmResult, vmResult] = await Promise.allSettled([
        getMetrics(),
        getLeaderboard(),
        getRoutingMetrics(),
        getVerifyMetrics(),
      ])

      const mData  = mResult.status  === 'fulfilled' ? mResult.value.data  : {}
      const lbData = lbResult.status === 'fulfilled' ? lbResult.value.data : { leaderboard: [] }
      const rmData = rmResult.status === 'fulfilled' ? rmResult.value.data : {}
      const vmData = vmResult.status === 'fulfilled' ? vmResult.value.data : {}

      setMetrics(mData)
      setLeaderboard(lbData.leaderboard || [])
      setRoutingMetrics(Object.keys(rmData).length > 0 ? rmData : null)
      setVerifyMetrics(Object.keys(vmData).length > 0 ? vmData : null)
      setLastRefresh(new Date())

      // Determine service health
      setServiceHealth({
        gateway:      mResult.status === 'fulfilled' ? 'online' : 'offline',
        routing:      (rmResult.status === 'fulfilled' && Object.keys(rmData).length > 0) ? 'online' : 'offline',
        verification: (vmResult.status === 'fulfilled' && Object.keys(vmData).length > 0) ? 'online' : 'offline',
      })

      // Build status breakdown from tickets (DB — only works when AI pipeline has run)
      const statusMap = { Pending: 0, 'In Progress': 0, 'Work Complete': 0, Resolved: 0, Rejected: 0 }
      const res = await listTickets({ page_size: 100 }).catch(() => ({ data: { tickets: [] } }))
      const dbTickets = res.data?.tickets || []
      dbTickets.forEach(t => {
        if (statusMap[t.status] != null) statusMap[t.status]++
        else statusMap['Pending']++
      })
      setTicketsByStatus(Object.entries(statusMap).map(([name, value]) => ({ name, value })))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 5000)
    return () => clearInterval(interval)
  }, [])

  const categoryData = leaderboard.slice(0, 8).map(item => ({
    name: `${item.category}\n${item.ward_id}`,
    count: item.count,
    category: item.category,
    ward: item.ward_id,
  }))

  const statusColors = {
    Pending: '#6366f1', 'In Progress': '#06b6d4',
    'Work Complete': '#14b8a6', Resolved: '#22c55e', Rejected: '#64748b',
  }

  return (
    <div style={{ padding: '24px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Admin Dashboard</h2>
          <p style={{ fontSize: '0.85rem' }}>CitySync Intelligence Platform · Real-time metrics</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            🔄 Refreshes every 5s · {lastRefresh ? `Last: ${lastRefresh.toLocaleTimeString()}` : 'Loading...'}
          </div>
          <button className="btn btn-outline btn-sm" onClick={fetchAll}>↻ Refresh</button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 100 }} />)}
        </div>
      ) : (
        <>
          {/* ── Stat Row ──────────────────────────────────────────────────────── */}
          <div className="grid-4" style={{ marginBottom: 24 }}>
            <MetricCard
              label="Total Requests" value={metrics?.request_count ?? '—'}
              sublabel="Gateway submissions (all-time)" color="#3b82f6"
            />
            <MetricCard
              label="P95 Latency" value={metrics?.p95_latency_ms?.toFixed(0) ?? '—'} unit="ms"
              sublabel="Gateway response" color="#14b8a6"
            />
            <MetricCard
              label="Rate Limit Hits" value={metrics?.rate_limit_hits ?? 0}
              sublabel="429 responses" color="#eab308"
            />
            <MetricCard
              label="Webhook Success"
              value={routingMetrics ? routingMetrics.webhook_success_rate : '—'} unit={routingMetrics ? '%' : ''}
              sublabel={routingMetrics ? 'Last 1 hour' : 'Routing service offline'} color="#22c55e"
            />
          </div>

          {/* ── Pipeline Service Health ────────────────────────────────────────── */}
          <div className="card" style={{ marginBottom: 24, padding: '18px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: '0.95rem' }}>⚙️ Pipeline Service Health</h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Auto-refreshes every 5s</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                {
                  key: 'gateway', label: 'Gateway (Port 8000)',
                  desc: `Submissions received: ${metrics?.request_count ?? 0}  ·  Rate-limited: ${metrics?.rate_limit_hits ?? 0}`,
                  tech: 'FastAPI + Redis Streams',
                },
                {
                  key: 'routing', label: 'Routing Service (Port 8001)',
                  desc: routingMetrics
                    ? `Routes loaded: ${routingMetrics.routes_loaded}  ·  Webhooks/hr: ${routingMetrics.total_webhooks_1h}  ·  Success: ${routingMetrics.webhook_success_rate}%`
                    : 'Start with: docker compose up routing  OR  python -m routing.main',
                  tech: 'FastAPI + Celery webhooks',
                },
                {
                  key: 'verification', label: 'Verification Engine (Port 8002)',
                  desc: verifyMetrics
                    ? `Step-1 pass: ${verifyMetrics.step1_pass_rate}%  ·  Step-2 pass: ${verifyMetrics.step2_pass_rate}%`
                    : 'Start with: docker compose up verification  OR  python -m verification.main',
                  tech: 'gpt-4o vision + PG trigger',
                },
              ].map(({ key, label, desc, tech }) => {
                const status = serviceHealth[key]
                const dotClass = status === 'online' ? 'service-dot-online'
                               : status === 'offline' ? 'service-dot-offline'
                               : 'service-dot-warn'
                return (
                  <div key={key} className="service-status-row">
                    <span className={dotClass} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{label}</span>
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px',
                          borderRadius: 'var(--radius-full)',
                          background: status === 'online' ? 'rgba(34,197,94,0.14)' : 'rgba(100,116,139,0.2)',
                          color: status === 'online' ? '#4ade80' : '#64748b',
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                        }}>
                          {status === 'checking' ? '…' : status}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: status === 'offline' ? '#f97316' : 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {desc}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>{tech}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="grid-4" style={{ marginBottom: 32 }}>
            <MetricCard
              label="Step 1 Pass Rate"
              value={verifyMetrics ? verifyMetrics.step1_pass_rate : '—'} unit={verifyMetrics ? '%' : ''}
              sublabel={verifyMetrics ? 'Field worker photos' : 'Verify service offline'} color="#8b5cf6"
            />
            <MetricCard
              label="Step 2 Pass Rate"
              value={verifyMetrics ? verifyMetrics.step2_pass_rate : '—'} unit={verifyMetrics ? '%' : ''}
              sublabel={verifyMetrics ? 'Citizen confirmations' : 'Verify service offline'} color="#06b6d4"
            />
            <MetricCard
              label="Webhook Attempts" value={routingMetrics?.total_webhooks_1h ?? '—'}
              sublabel="Last hour" color="#f97316"
            />
            <MetricCard
              label="Routes Loaded" value={routingMetrics?.routes_loaded ?? '—'}
              sublabel="In-memory routing" color="#ec4899"
            />
          </div>

          {/* ── Charts Row ────────────────────────────────────────────────────── */}

          <div className="grid-2" style={{ marginBottom: 32 }}>
            {/* Complaint Frequency Leaderboard */}
            <div className="card">
              <h3 style={{ marginBottom: 16, fontSize: '1rem' }}>🔥 Hotspot Leaderboard (Top 8)</h3>
              {categoryData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                  No frequency data yet · Submit complaints to see hotspots
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={categoryData} margin={{ top: 4, right: 8, bottom: 40, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                      angle={-30}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                    <Tooltip content={<CUSTOM_TOOLTIP />} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Ticket Status Breakdown */}
            <div className="card">
              <h3 style={{ marginBottom: 16, fontSize: '1rem' }}>📊 Ticket Status Breakdown</h3>
              {ticketsByStatus.every(s => s.value === 0) ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                  No tickets yet
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                  <ResponsiveContainer width="55%" height={220}>
                    <PieChart>
                      <Pie data={ticketsByStatus} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                        {ticketsByStatus.map((entry, i) => (
                          <Cell key={i} fill={statusColors[entry.name] || COLORS[i]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CUSTOM_TOOLTIP />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {ticketsByStatus.map((s, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColors[s.name] || COLORS[i], display: 'inline-block' }} />
                          {s.name}
                        </div>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── AI Pipeline Stats ─────────────────────────────────────────────── */}
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 16, fontSize: '1rem' }}>🤖 AI Pipeline Performance</h3>
            <div className="grid-4">
              {[
                { label: 'Classifier', value: metrics?.mock_ai ? 'Mock Mode' : 'gpt-4o-mini', sublabel: 'intent+category+severity', icon: '🧠' },
                { label: 'Avg Latency', value: '~380ms', sublabel: 'classification + dedup', icon: '⚡' },
                { label: 'Verifier', value: metrics?.mock_ai ? 'Mock Mode' : 'gpt-4o vision', sublabel: 'before/after comparison', icon: '👁️' },
                { label: 'Dedup Radius', value: '50m', sublabel: 'PostGIS ST_DWithin', icon: '📍' },
              ].map((item, i) => (
                <div key={i} className="card card-sm" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '1.4rem' }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{item.value}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.sublabel}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Architecture Layers ────────────────────────────────────────────── */}
          <div className="card">
            <h3 style={{ marginBottom: 16, fontSize: '1rem' }}>🏗 System Architecture — 7 Layers</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { layer: 'L1', name: 'Citizen Interface', tech: 'React PWA + WhatsApp/SMS', color: '#3b82f6' },
                { layer: 'L2', name: 'Event Streaming', tech: 'Redis Streams (consumer groups)', color: '#8b5cf6' },
                { layer: 'L3', name: 'AI Processing', tech: 'gpt-4o-mini + PostGIS dedup + priority scorer', color: '#06b6d4' },
                { layer: 'L3.5', name: 'Routing', tech: 'FastAPI + Celery webhook retry + SendGrid fallback', color: '#14b8a6' },
                { layer: 'L4', name: 'Privacy Vault', tech: 'HMAC-SHA256 + Gaussian DP noise (ε=2.0/0.5)', color: '#eab308' },
                { layer: 'L5', name: 'Persistence', tech: 'PostgreSQL 16+PostGIS + MinIO + Redis sorted sets', color: '#f97316' },
                { layer: 'L5.5', name: 'Verification Engine', tech: 'gpt-4o vision + PG trigger enforcement', color: '#ef4444' },
                { layer: 'L6', name: 'Presentation', tech: 'React+Vite PWA + Mapbox GL JS + Socket.io', color: '#22c55e' },
              ].map((item) => (
                <div key={item.layer} style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '10px 14px',
                  background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)',
                  borderLeft: `3px solid ${item.color}`,
                }}>
                  <span style={{
                    fontFamily: 'monospace', fontWeight: 700, fontSize: '0.8rem',
                    color: item.color, minWidth: 36,
                  }}>
                    {item.layer}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem', minWidth: 180 }}>{item.name}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.tech}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

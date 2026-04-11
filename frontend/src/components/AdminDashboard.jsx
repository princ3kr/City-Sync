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


        </>
      )}
    </div>
  )
}

import React, { useEffect, useState, useMemo } from 'react'
import api, { getMe } from '../utils/api'

export default function DeptPortal() {
  const [stats, setStats] = useState({ 
    total: 0, webhooks_received: 0, valid_signatures: 0 
  })
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState(null)

  useEffect(() => {
    getMe().then((r) => setMe(r.data)).catch(() => setMe(null))
  }, [])

  useEffect(() => {
    const fetchData = async () => {
        try {
            // Note: Since gateway serves this now, the data format might be different
            // Gateway responds with { log: [...], tickets: [...] }
            const res = await api.get('/api/stats/webhooks')
            const data = res.data
            setTickets(data.tickets || [])
            setStats({
                total: data.tickets?.length || 0,
                webhooks_received: data.log?.length || 0,
                valid_signatures: data.log?.filter(l => l.signature_valid).length || 0
            })
        } catch (e) {
            console.error("Failed to fetch webhooks:", e)
        } finally {
            setLoading(false)
        }
    }
    fetchData()
    const intv = setInterval(fetchData, 10000)
    return () => clearInterval(intv)
  }, [])

  const TIER_COLORS = { Critical: '#ef4444', High: '#f97316', Medium: '#eab308', Low: '#22c55e' }

  const deptCode = (me?.dept_code || '').toLowerCase()
  const visibleTickets = useMemo(() => {
    if (!deptCode) return tickets
    return tickets.filter((t) => (t.dept_code || '').toLowerCase() === deptCode)
  }, [tickets, deptCode])

  return (
    <div className="container" style={{ paddingTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.5rem' }}>🏢 Unified Department Webhooks</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span className="status-dot live" style={{ background: '#22c55e' }}></span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Live updates</span>
        </div>
      </div>

      {deptCode && (
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          Showing webhooks for <strong style={{ color: 'var(--text-primary)' }}>{me?.dept_name || deptCode}</strong> only.
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        <div className="card">
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-blue)' }}>{deptCode ? visibleTickets.length : stats.total}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Tickets Pushed</div>
        </div>
        <div className="card">
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-blue)' }}>{stats.webhooks_received}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Webhook Hits</div>
        </div>
        <div className="card">
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-blue)' }}>{stats.valid_signatures}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Valid Signatures</div>
        </div>
        <div className="card">
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#22c55e' }}>✓</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Routing OK</div>
        </div>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: 16 }}>📋 Webhook Log (Last 200)</h2>
        
        {loading ? (
             <div className="skeleton" style={{ height: 200 }} />
        ) : visibleTickets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '3rem', marginBottom: 12 }}>📭</div>
                <div>{deptCode ? 'No webhooks for your department yet.' : 'No department webhooks received yet.'}</div>
            </div>
        ) : (
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                            <th style={{ padding: '12px', fontWeight: 600 }}>Ticket ID</th>
                            <th style={{ padding: '12px', fontWeight: 600 }}>Department</th>
                            <th style={{ padding: '12px', fontWeight: 600 }}>Category</th>
                            <th style={{ padding: '12px', fontWeight: 600 }}>Priority</th>
                            <th style={{ padding: '12px', fontWeight: 600 }}>Score</th>
                            <th style={{ padding: '12px', fontWeight: 600 }}>Received</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visibleTickets.map((t, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '12px' }}><code style={{ color: 'var(--accent-blue)' }}>{t.ticket_id}</code></td>
                                <td style={{ padding: '12px' }}>{t.dept_code || '—'}</td>
                                <td style={{ padding: '12px' }}>{t.category}</td>
                                <td style={{ padding: '12px' }}>
                                    <span style={{ 
                                        padding: '2px 8px', borderRadius: 999, 
                                        background: `${TIER_COLORS[t.severity_tier]}22`, color: TIER_COLORS[t.severity_tier],
                                        fontWeight: 600, fontSize: '0.75rem' 
                                    }}>{t.severity_tier}</span>
                                </td>
                                <td style={{ padding: '12px', fontWeight: 700, color: TIER_COLORS[t.severity_tier] }}>{Math.round(t.priority_score)}</td>
                                <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{new Date(t.received_at).toLocaleTimeString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
      </div>
    </div>
  )
}

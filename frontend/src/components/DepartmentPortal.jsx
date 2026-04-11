import React, { useState, useEffect } from 'react'
import { getDeptStats, getDeptTickets, getDeptWebhookLog } from '../utils/api'
import PriorityBadge from './PriorityBadge'

export default function DepartmentPortal() {
  const [stats, setStats] = useState({ total: 0, webhooks_received: 0, valid_signatures: 0 })
  const [tickets, setTickets] = useState([])
  const [logs, setLogs] = useState([])
  const [lastRefreshed, setLastRefreshed] = useState(new Date())

  const refreshData = async () => {
    try {
      const [sRes, tRes, lRes] = await Promise.all([
        getDeptStats(),
        getDeptTickets(),
        getDeptWebhookLog()
      ])
      setStats(sRes.data)
      setTickets(tRes.data.tickets || [])
      setLogs(lRes.data.log || [])
      setLastRefreshed(new Date())
    } catch (err) {
      console.error('Failed to sync with Department service:', err)
    }
  }

  useEffect(() => {
    refreshData()
    const timer = setInterval(refreshData, 10000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="dept-portal">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>🏢 Department Oversight</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Real-time webhook ingestion · Signature Verification Active
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>
            LAST SYNC: {lastRefreshed.toLocaleTimeString()}
          </div>
          <button className="btn btn-outline btn-sm" onClick={refreshData}>🔄 Refresh Now</button>
        </div>
      </div>

      <div className="stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Tickets Received', value: stats.total, color: 'var(--accent-blue)' },
          { label: 'Webhook Calls', value: stats.webhooks_received, color: 'var(--text-primary)' },
          { label: 'Valid Signatures', value: stats.valid_signatures, color: 'var(--tier-low)' },
          { label: 'Portal Status', value: 'Live', color: 'var(--tier-low)', icon: '●' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: s.color }}>
              {s.icon && <span style={{ marginRight: 8, fontSize: '0.8rem' }}>{s.icon}</span>}
              {s.value}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        {/* Main Dashboard */}
        <div className="card">
          <h3 style={{ marginBottom: 20 }}>📋 Recent Tickets (Department View)</h3>
          {tickets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '3rem', marginBottom: 12 }}>📭</div>
              No tickets received from the routing engine yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: 12 }}>ID</th>
                    <th>DEPT</th>
                    <th>CATEGORY</th>
                    <th>PRIORITY</th>
                    <th>WARD</th>
                    <th style={{ textAlign: 'right', paddingRight: 12 }}>RECEIVED</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map(t => (
                    <tr key={t.ticket_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.85rem' }}>
                      <td style={{ padding: 12 }}><code style={{ color: 'var(--accent-blue)' }}>{t.ticket_id}</code></td>
                      <td><span className="pill" style={{ background: 'var(--bg-surface)' }}>{t.dept_code}</span></td>
                      <td>{t.category}</td>
                      <td><PriorityBadge score={t.priority_score} tier={t.severity_tier} /></td>
                      <td>{t.ward_id}</td>
                      <td style={{ textAlign: 'right', paddingRight: 12, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {new Date(t.received_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Webhook Log */}
        <div className="card">
          <h3 style={{ marginBottom: 20 }}>🛰 Webhook Activity</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {logs.slice(0, 10).map(log => (
              <div key={log.id} style={{ 
                fontSize: '0.78rem', padding: 10, borderRadius: 'var(--radius-sm)',
                background: log.signature_valid ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)',
                border: `1px solid ${log.signature_valid ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700 }}>{log.dept_code}</span>
                  <span style={{ color: log.signature_valid ? 'var(--tier-low)' : 'var(--tier-critical)' }}>
                    {log.signature_valid ? '✓ Verified' : '✗ Failed Sig'}
                  </span>
                </div>
                <div style={{ color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{log.ticket_id}</span>
                  <span>{new Date(log.received_at).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
            {logs.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No activity logged.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

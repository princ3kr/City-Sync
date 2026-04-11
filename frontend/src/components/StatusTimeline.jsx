import React, { useState, useEffect } from 'react'
import { getTicket } from '../utils/api'
import { PriorityBadge, StatusBadge } from './PriorityBadge'

// `done`: ticket has passed this milestone. Note: `Pending` means AI finished and the ticket is queued for field work — not still in AI.
const STATUS_STEPS = [
  { status: 'Pending',       icon: '📥', label: 'Received',       done: ['Pending', 'Processing', 'In Progress', 'Work Complete', 'Resolved'] },
  { status: 'Processing',    icon: '🤖', label: 'AI Processing',  done: ['Pending', 'In Progress', 'Work Complete', 'Resolved'] },
  { status: 'In Progress',   icon: '🔧', label: 'Field Work',     done: ['Work Complete', 'Resolved'] },
  { status: 'Work Complete', icon: '📷', label: 'Verification',   done: ['Resolved'] },
  { status: 'Resolved',      icon: '✅', label: 'Resolved',       done: ['Resolved'] },
]

/** Which timeline row is the logical “current” step for a DB status */
function activeStepForStatus(status) {
  const s = status || 'Pending'
  if (s === 'Processing') return 'Processing'
  if (s === 'Pending') return 'In Progress'
  if (s === 'In Progress') return 'In Progress'
  if (s === 'Work Complete') return 'Work Complete'
  if (s === 'Resolved') return 'Resolved'
  if (s === 'Human Review') return 'Processing'
  return null
}

export default function StatusTimeline({ ticketId }) {
  const [ticket, setTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!ticketId) return
    const fetch = async () => {
      try {
        const res = await getTicket(ticketId)
        setTicket(res.data)
      } catch (e) {
        setError('Ticket not found')
      } finally {
        setLoading(false)
      }
    }
    fetch()
    const interval = setInterval(fetch, 8000)
    return () => clearInterval(interval)
  }, [ticketId])

  if (loading) return <div className="skeleton" style={{ height: 200 }} />
  if (error || !ticket) return <div style={{ color: 'var(--text-muted)' }}>{error || 'No ticket data'}</div>

  const currentStatus = ticket.status || 'Pending'
  const isResolved = currentStatus === 'Resolved'
  const activeStep = activeStepForStatus(currentStatus)

  return (
    <div className="card">
      {/* Header */}
      <div style={{ display: 'flex', justify: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 4 }}>
            {ticket.ticket_id}
          </div>
          <h3 style={{ fontSize: '1.1rem', marginBottom: 8 }}>{ticket.category || 'Complaint'}</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <PriorityBadge tier={ticket.severity_tier || 'Low'} score={ticket.priority_score} showScore />
            <StatusBadge status={currentStatus} />
            {ticket.ward_id && (
              <span className="badge" style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)' }}>
                Ward {ticket.ward_id}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="timeline">
        {STATUS_STEPS.map((step, i) => {
          const isDone = step.done.includes(currentStatus)
          const isActive = activeStep != null && step.status === activeStep
          return (
            <div key={step.status} className="timeline-item">
              <div className={`timeline-dot ${isActive ? 'active' : isDone ? 'done' : 'pending'}`} />
              <div className="timeline-content">
                <div className="timeline-title" style={{ color: (isDone || isActive) ? 'var(--text-primary)' : 'var(--text-muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span>{step.icon}</span>
                  <span>{step.label}</span>
                  {isActive && (
                    <span style={{ fontSize: '0.7rem', background: 'rgba(6,182,212,0.15)', color: '#06b6d4', padding: '1px 8px', borderRadius: 999 }}>
                      Current
                    </span>
                  )}
                </div>
                {step.status === 'Processing' && isActive && (
                  <div className="timeline-time">AI classification + dedup + priority scoring (~400ms)</div>
                )}
                {step.status === 'In Progress' && isActive && currentStatus === 'Pending' && (
                  <div className="timeline-time">Classified — awaiting dispatch to a field team</div>
                )}
                {step.status === 'In Progress' && isActive && currentStatus === 'In Progress' && (
                  <div className="timeline-time">Field team is working on this issue</div>
                )}
                {step.status === 'Work Complete' && currentStatus === 'Work Complete' && (
                  <div className="timeline-time">Field team submitted after-photo · Awaiting your confirmation</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Upvote */}
      {!isResolved && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              👥 {ticket.upvote_count || 0} citizen{(ticket.upvote_count || 0) !== 1 ? 's' : ''} reported this
            </span>
            <button className="btn btn-outline btn-sm"
              onClick={async () => {
                const { upvoteTicket } = await import('../utils/api')
                await upvoteTicket(ticket.ticket_id).catch(() => {})
                setTicket(t => ({ ...t, upvote_count: (t.upvote_count || 0) + 1 }))
              }}>
              +1 Me Too
            </button>
          </div>
        </div>
      )}

      {isResolved && (
        <div style={{
          marginTop: 16, padding: '12px 16px',
          background: 'rgba(34,197,94,0.08)',
          border: '1px solid rgba(34,197,94,0.2)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.85rem', color: 'var(--tier-low)',
        }}>
          ✅ This issue has been verified as resolved. Thank you for reporting!
        </div>
      )}
    </div>
  )
}

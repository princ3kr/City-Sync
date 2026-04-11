import React, { useEffect, useRef, useState } from 'react'
import { useTickets } from '../hooks/useTickets'
import { useSocket } from '../hooks/useSocket'
import { PriorityBadge, StatusBadge } from './PriorityBadge'
import { assignTicket, listFieldWorkers } from '../utils/api'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || ''

// Mumbai coordinates (default center)
const DEFAULT_CENTER = [72.8777, 19.0760]

const TIER_COLORS = {
  Critical: '#ef4444',
  High:     '#f97316',
  Medium:   '#eab308',
  Low:      '#22c55e',
}

export default function OfficerMap({ demoRole = 'citizen' }) {
  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [usingFallback, setUsingFallback] = useState(!MAPBOX_TOKEN)

  const { tickets, loading, addOrUpdateTicket, refetch } = useTickets({
    status: 'Pending,In Progress',
    page_size: 100,
  })
  const { connected, lastEvent } = useSocket('all')
  const [workers, setWorkers] = useState([])

  useEffect(() => {
    listFieldWorkers()
      .then((res) => setWorkers(res.data?.workers || []))
      .catch(() => setWorkers([]))
  }, [demoRole])

  // ── Initialize Map ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    if (!MAPBOX_TOKEN) {
      setUsingFallback(true)
      setMapLoaded(true)
      return
    }

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = MAPBOX_TOKEN

      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: DEFAULT_CENTER,
        zoom: 11,
        attributionControl: false,
      })

      map.on('load', () => {
        setMapLoaded(true)
        mapRef.current = map
      })

      return () => map.remove()
    }).catch(() => {
      setUsingFallback(true)
      setMapLoaded(true)
    })
  }, [])

  // ── Add / update markers ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || usingFallback || !mapRef.current) return

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      tickets.forEach(ticket => {
        const { ticket_id, location, severity_tier, priority_score } = ticket
        if (!location?.lat || !location?.lng) return

        const color = TIER_COLORS[severity_tier] || TIER_COLORS.Low
        const size = Math.max(12, Math.min(30, 10 + (priority_score || 0) / 5))
        const inField = ticket.status === 'In Progress'

        if (markersRef.current[ticket_id]) {
          // Update existing marker intensity (priority boost animation)
          const el = markersRef.current[ticket_id].getElement()
          el.style.width = `${size}px`
          el.style.height = `${size}px`
          el.style.borderColor = color
          el.style.borderStyle = inField ? 'dashed' : 'solid'
          el.style.opacity = inField ? '0.92' : '1'
        } else {
          // Create new marker
          const el = document.createElement('div')
          el.className = 'map-marker'
          el.style.cssText = `
            width: ${size}px; height: ${size}px;
            border-radius: 50%;
            background: ${color}40;
            border: 2px ${inField ? 'dashed' : 'solid'} ${color};
            cursor: pointer;
            transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
            box-shadow: 0 0 ${size}px ${color}60;
            opacity: ${inField ? 0.92 : 1};
          `
          el.addEventListener('click', () => setSelectedTicket(ticket))

          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([location.lng, location.lat])
            .addTo(mapRef.current)

          markersRef.current[ticket_id] = marker
        }
      })
    })
  }, [tickets, mapLoaded, usingFallback])

  // ── Real-time WebSocket updates ─────────────────────────────────────────────
  useEffect(() => {
    if (!lastEvent) return
    if (lastEvent.type === 'ticket.update' || lastEvent.type === 'priority.boost') {
      addOrUpdateTicket(lastEvent.data)
    }
  }, [lastEvent, addOrUpdateTicket])

  // ── Fallback table view ─────────────────────────────────────────────────────
  if (usingFallback) {
    return (
      <div style={{ padding: '24px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>Live Dispatch Queue</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sorted automatically by AI Priority Engine</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: connected ? 'var(--tier-low)' : 'var(--text-muted)' }}>
            <span className={`status-dot${connected ? ' live' : ''}`} style={{ background: connected ? '#22c55e' : '#475569' }} />
            {connected ? 'Live Updates Active' : 'Polling'}
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 80 }} />)}
          </div>
        ) : tickets.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🏙️</div>
            <p>No active tickets. Mumbai looks clean today!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tickets.map(ticket => (
              <OfficerTicketRow
                key={ticket.ticket_id}
                ticket={ticket}
                onClick={() => setSelectedTicket(ticket)}
                selected={selectedTicket?.ticket_id === ticket.ticket_id}
              />
            ))}
          </div>
        )}

        {selectedTicket && (
          <TicketDetailPanel
            ticket={selectedTicket}
            workers={workers}
            onClose={() => setSelectedTicket(null)}
            onAssigned={(updated) => {
              addOrUpdateTicket(updated)
              setSelectedTicket(updated)
              refetch()
            }}
          />
        )}
      </div>
    )
  }

  const ticketsWithCoords = tickets.filter(
    (t) => t.location?.lat != null && t.location?.lng != null,
  )

  return (
    <div style={{ position: 'relative', height: 'calc(100vh - 120px)' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%', borderRadius: 'var(--radius-lg)' }} />

      {tickets.length > 0 && ticketsWithCoords.length === 0 && (
        <div
          className="card card-sm"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            maxWidth: 420,
            textAlign: 'center',
            zIndex: 2,
            background: 'rgba(15,23,42,0.92)',
            border: '1px solid rgba(148,163,184,0.35)',
          }}
        >
          <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 8 }}>No map pins yet</div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
            These tickets have no fuzzed GPS in the database (e.g. still processing, or submission had no location).
            Use the <strong>table view</strong> by clearing <code>VITE_MAPBOX_TOKEN</code>, or submit with GPS enabled.
          </p>
        </div>
      )}

      {/* Overlay Controls */}
      <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="card card-sm" style={{ minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', align: 'center', gap: 8 }}>
              <span className={`status-dot${connected ? ' live' : ''}`} style={{ background: connected ? '#22c55e' : '#f97316' }} />
              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{connected ? 'Live' : 'Connecting...'}</span>
            </div>
            {/* Manual fallback toggle */}
            <button 
              className="btn btn-ghost btn-sm" 
              style={{ padding: '2px 6px', height: 'auto', fontSize: '0.65rem', border: '1px solid var(--border)' }}
              onClick={() => setUsingFallback(true)}
            >
              List View
            </button>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {tickets.length} active tickets
          </div>
          {!connected && (
            <div style={{ fontSize: '0.65rem', color: '#f97316', marginTop: 4 }}>
              Check gateway (port 8000)
            </div>
          )}
        </div>
        {/* Legend */}
        <div className="card card-sm">
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>PRIORITY</div>
          {Object.entries(TIER_COLORS).map(([tier, color]) => (
            <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: '0.78rem' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
              {tier}
            </div>
          ))}
        </div>
      </div>

      {selectedTicket && (
        <div style={{ position: 'absolute', bottom: 24, right: 24, width: 360 }}>
          <TicketDetailPanel
            ticket={selectedTicket}
            workers={workers}
            onClose={() => setSelectedTicket(null)}
            onAssigned={(updated) => {
              addOrUpdateTicket(updated)
              setSelectedTicket(updated)
              refetch()
            }}
          />
        </div>
      )}
    </div>
  )
}

function OfficerTicketRow({ ticket, onClick, selected }) {
  const { ticket_id, category, severity_tier, priority_score, status, ward_id, upvote_count, assigned_worker_label } = ticket
  return (
    <div
      className="card card-sm"
      style={{
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        borderColor: selected ? 'var(--accent-blue)' : undefined,
        transition: 'all 0.2s',
      }}
      onClick={onClick}
    >
      {/* Priority dot */}
      <div style={{
        width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
        background: TIER_COLORS[severity_tier] || '#22c55e',
        boxShadow: `0 0 8px ${TIER_COLORS[severity_tier] || '#22c55e'}80`,
      }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
          {category} · Ward {ward_id || '—'}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {ticket_id} · {upvote_count} reports
          {assigned_worker_label && (
            <span style={{ display: 'block', marginTop: 2, color: 'var(--accent-blue)' }}>
              👷 {assigned_worker_label}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <span style={{
          fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem',
          color: TIER_COLORS[severity_tier] || '#22c55e',
        }}>
          {Math.round(priority_score)}
        </span>
        <StatusBadge status={status} />
      </div>
    </div>
  )
}

function TicketDetailPanel({ ticket, onClose, workers, onAssigned }) {
  const {
    ticket_id,
    category,
    severity_tier,
    priority_score,
    status,
    description,
    ward_id,
    severity,
    upvote_count,
    assigned_worker_label,
  } = ticket
  const [assigneeId, setAssigneeId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState(null)

  useEffect(() => {
    setAssignError(null)
    const match = ticket.assigned_worker_id
    if (match && workers.some((w) => w.worker_id === match)) setAssigneeId(match)
    else if (workers[0]) setAssigneeId(workers[0].worker_id)
    else setAssigneeId('')
  }, [ticket.ticket_id, ticket.assigned_worker_id, workers])

  const canAssign = status === 'Pending' || status === 'In Progress'
  const hasRoster = workers.length > 0

  const handleAssign = async () => {
    if (!assigneeId || !canAssign) return
    setAssigning(true)
    setAssignError(null)
    try {
      const res = await assignTicket(ticket_id, assigneeId)
      onAssigned?.(res.data.ticket)
    } catch (err) {
      const detail = err.response?.data?.detail
      let msg =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map((d) => (typeof d === 'object' ? d.msg || JSON.stringify(d) : d)).join('; ')
            : null
      if (!msg && err.response?.status === 403) {
        msg = 'Use the Officer demo role to assign work.'
      }
      setAssignError(msg || 'Assignment failed.')
    } finally {
      setAssigning(false)
    }
  }

  return (
    <div className="card" style={{ boxShadow: 'var(--shadow-elevated)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: '1rem' }}>{category}</h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <PriorityBadge tier={severity_tier} score={priority_score} showScore />
        <StatusBadge status={status} />
        {assigned_worker_label && (
          <span className="badge" style={{ background: 'rgba(59,130,246,0.12)', color: '#93c5fd' }}>
            👷 {assigned_worker_label}
          </span>
        )}
      </div>
      {description && <p style={{ fontSize: '0.85rem', marginBottom: 12 }}>{description}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
        <span>🗺 Ward: {ward_id || '—'}</span>
        <span>⚡ Severity: {severity}/10</span>
        <span>👥 Reports: {upvote_count}</span>
        <span>🆔 {ticket_id}</span>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
          Assign field worker
        </div>
        {!hasRoster && (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 10 }}>
            No roster loaded — ensure you are on the Officer demo role so the map can load workers.
          </p>
        )}
        {hasRoster && (
          <select
            className="input"
            style={{ marginBottom: 10, width: '100%', fontSize: '0.85rem' }}
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            disabled={!canAssign || assigning}
          >
            {workers.map((w) => (
              <option key={w.worker_id} value={w.worker_id}>{w.display_name}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="btn btn-primary btn-sm btn-full"
          disabled={!canAssign || !hasRoster || assigning}
          onClick={handleAssign}
        >
          {assigning ? 'Assigning…' : status === 'In Progress' ? 'Update assignment' : 'Assign & start field work'}
        </button>
        {!canAssign && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
            Dispatch is only available while the ticket is Pending or In Progress.
          </p>
        )}
        {assignError && (
          <p style={{ fontSize: '0.78rem', color: 'var(--tier-critical)', marginTop: 8 }}>{assignError}</p>
        )}
      </div>
    </div>
  )
}

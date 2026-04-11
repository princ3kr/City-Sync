import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useTickets } from '../hooks/useTickets'
import { useSocket } from '../hooks/useSocket'
import { PriorityBadge, StatusBadge } from './PriorityBadge'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || ''

// Mumbai coordinates (default center)
const DEFAULT_CENTER = [72.8777, 19.0760]

const TIER_COLORS = {
  Critical: '#ef4444',
  High:     '#f97316',
  Medium:   '#eab308',
  Low:      '#22c55e',
}

export default function OfficerMap() {
  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [usingFallback, setUsingFallback] = useState(!MAPBOX_TOKEN)

  const { tickets, loading, addOrUpdateTicket } = useTickets({ status: 'Pending', page_size: 100 })
  const { connected, lastEvent } = useSocket('all')

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

        if (markersRef.current[ticket_id]) {
          // Update existing marker intensity (priority boost animation)
          const el = markersRef.current[ticket_id].getElement()
          el.style.width = `${size}px`
          el.style.height = `${size}px`
          el.style.borderColor = color
        } else {
          // Create new marker
          const el = document.createElement('div')
          el.className = 'map-marker'
          el.style.cssText = `
            width: ${size}px; height: ${size}px;
            border-radius: 50%;
            background: ${color}40;
            border: 2px solid ${color};
            cursor: pointer;
            transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
            box-shadow: 0 0 ${size}px ${color}60;
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
        <div style={{
          background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)',
          borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 20,
          fontSize: '0.85rem', color: '#eab308',
        }}>
          ⚠️ Mapbox token not configured · Showing officer list view ·
          Set <code>VITE_MAPBOX_TOKEN</code> in frontend/.env for the full map
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3>Active Tickets — Priority View</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: connected ? 'var(--tier-low)' : 'var(--text-muted)' }}>
            <span className={`status-dot${connected ? ' live' : ''}`} style={{ background: connected ? '#22c55e' : '#475569' }} />
            {connected ? 'Live Updates' : 'Polling'}
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
          <TicketDetailPanel ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />
        )}
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', height: 'calc(100vh - 120px)' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%', borderRadius: 'var(--radius-lg)' }} />

      {/* Overlay Controls */}
      <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="card card-sm" style={{ minWidth: 200 }}>
          <div style={{ display: 'flex', align: 'center', gap: 8, marginBottom: 8 }}>
            <span className={`status-dot${connected ? ' live' : ''}`} style={{ background: connected ? '#22c55e' : '#f97316' }} />
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{connected ? 'Live' : 'Connecting...'}</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {tickets.length} active tickets
          </div>
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
          <TicketDetailPanel ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />
        </div>
      )}
    </div>
  )
}

function OfficerTicketRow({ ticket, onClick, selected }) {
  const { ticket_id, category, severity_tier, priority_score, status, ward_id, upvote_count } = ticket
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

function TicketDetailPanel({ ticket, onClose }) {
  const { ticket_id, category, severity_tier, priority_score, status, description, ward_id, severity, upvote_count, submitted_at } = ticket
  return (
    <div className="card" style={{ boxShadow: 'var(--shadow-elevated)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: '1rem' }}>{category}</h3>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <PriorityBadge tier={severity_tier} score={priority_score} showScore />
        <StatusBadge status={status} />
      </div>
      {description && <p style={{ fontSize: '0.85rem', marginBottom: 12 }}>{description}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
        <span>🗺 Ward: {ward_id || '—'}</span>
        <span>⚡ Severity: {severity}/10</span>
        <span>👥 Reports: {upvote_count}</span>
        <span>🆔 {ticket_id}</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm btn-full">Assign Field Worker</button>
      </div>
    </div>
  )
}

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
  const [usingLeaflet, setUsingLeaflet] = useState(false)
  const [error, setError] = useState(null)

  const { tickets, loading, addOrUpdateTicket } = useTickets({ status: 'Pending', page_size: 100 })
  const { connected, lastEvent } = useSocket('all')

  // ── Initialize Map ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    if (MAPBOX_TOKEN && !MAPBOX_TOKEN.includes('your_mapbox_token')) {
      import('mapbox-gl').then(({ default: mapboxgl }) => {
        mapboxgl.accessToken = MAPBOX_TOKEN
        try {
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
        } catch (e) {
          console.warn('Mapbox failed, falling back to Leaflet', e)
          initLeaflet()
        }
      }).catch(initLeaflet)
    } else {
      initLeaflet()
    }

    function initLeaflet() {
      if (!window.L) {
        setError("Map libraries failed to load")
        return
      }
      setUsingLeaflet(true)
      const L = window.L
      const map = L.map(mapContainer.current, {
        zoomControl: false,
        attributionControl: false
      }).setView([DEFAULT_CENTER[1], DEFAULT_CENTER[0]], 12)

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CartoDB'
      }).addTo(map)

      L.control.zoom({ position: 'bottomright' }).addTo(map)

      setMapLoaded(true)
      mapRef.current = map
    }
  }, [])

  // ── Focus on selected ticket ────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedTicket || !mapRef.current || !mapLoaded) return
    const { lat, lng } = selectedTicket.location || {}
    if (!lat || !lng) return

    if (usingLeaflet) {
      mapRef.current.flyTo([lat, lng], 15, { duration: 1.5 })
    } else {
      mapRef.current.flyTo({ center: [lng, lat], zoom: 15, duration: 1500, essential: true })
    }
  }, [selectedTicket, mapLoaded, usingLeaflet])

  // ── Add / update markers & Fit Bounds ─────────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || tickets.length === 0) return

    const bounds = usingLeaflet ? new window.L.LatLngBounds() : null
    let markersAdded = false

    if (usingLeaflet) {
      const L = window.L
      tickets.forEach(ticket => {
        const { ticket_id, location, severity_tier, priority_score } = ticket
        if (!location?.lat || !location?.lng) return

        const color = TIER_COLORS[severity_tier] || TIER_COLORS.Low
        const size = Math.max(16, Math.min(32, 14 + (priority_score || 0) / 5))

        if (!markersRef.current[ticket_id]) {
          const icon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div class="map-marker-leaf" style="background: ${color}; width: ${size}px; height: ${size}px; border-radius: 50%; box-shadow: 0 0 10px ${color}80;"></div>`,
            iconSize: [size, size],
            iconAnchor: [size/2, size/2]
          })

          const marker = L.marker([location.lat, location.lng], { icon })
            .on('click', () => setSelectedTicket(ticket))
            .addTo(mapRef.current)

          markersRef.current[ticket_id] = marker
          markersAdded = true
        }
        bounds.extend([location.lat, location.lng])
      })

      // Auto-fit bounds on initial load if we have markers
      if (markersAdded && Object.keys(markersRef.current).length > 0) {
        mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 })
      }
    } else {
      import('mapbox-gl').then(({ default: mapboxgl }) => {
        const mbBounds = new mapboxgl.LngLatBounds()
        tickets.forEach(ticket => {
          const { ticket_id, location, severity_tier, priority_score } = ticket
          if (!location?.lat || !location?.lng) return

          const color = TIER_COLORS[severity_tier] || TIER_COLORS.Low
          const size = Math.max(16, Math.min(32, 14 + (priority_score || 0) / 5))

          if (!markersRef.current[ticket_id]) {
            const el = document.createElement('div')
            el.className = 'map-marker-leaf'
            el.style.cssText = `width: ${size}px; height: ${size}px; border-radius: 50%; background: ${color}; cursor: pointer; transition: all 0.4s; box-shadow: 0 0 ${size}px ${color}80;`
            el.addEventListener('click', () => setSelectedTicket(ticket))
            const marker = new mapboxgl.Marker({ element: el }).setLngLat([location.lng, location.lat]).addTo(mapRef.current)
            markersRef.current[ticket_id] = marker
            markersAdded = true
          }
          mbBounds.extend([location.lng, location.lat])
        })

        if (markersAdded && Object.keys(markersRef.current).length > 0) {
          mapRef.current.fitBounds(mbBounds, { padding: 50, maxZoom: 15 })
        }
      })
    }
  }, [tickets, mapLoaded, usingLeaflet])

  useEffect(() => {
    if (!lastEvent) return
    if (lastEvent.type === 'ticket.update' || lastEvent.type === 'priority.boost') {
      addOrUpdateTicket(lastEvent.data)
    }
  }, [lastEvent, addOrUpdateTicket])

  return (
    <div className="officer-layout">
      {/* Map Section */}
      <div style={{ position: 'relative', height: '100%', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
        
        {/* Map Legend Overlay */}
        <div style={{ position: 'absolute', bottom: 20, left: 20, zIndex: 1000 }}>
          <div className="card card-sm" style={{ padding: '8px 12px', background: 'rgba(15, 22, 36, 0.9)', backdropFilter: 'blur(8px)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 700 }}>LEGEND</div>
            <div style={{ display: 'flex', gap: 12 }}>
              {Object.entries(TIER_COLORS).map(([tier, color]) => (
                <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                  {tier}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Selected Ticket Popup Overlay */}
        {selectedTicket && (
          <div style={{ position: 'absolute', top: 20, right: 20, width: 320, zIndex: 1000 }}>
            <TicketDetailPanel ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />
          </div>
        )}
      </div>

      {/* Sidebar Ticket Queue */}
      <div className="officer-sidebar">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '0 4px' }}>
          <h3 style={{ fontSize: '0.95rem' }}>Active Queue</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: connected ? 'var(--tier-low)' : 'var(--text-muted)' }}>
            <span className={`status-dot${connected ? ' live' : ''}`} style={{ background: connected ? '#22c55e' : '#475569' }} />
            {connected ? 'Live' : 'Offline'}
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton" style={{ height: 74 }} />)}
          </div>
        ) : tickets.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <p style={{ fontSize: '0.85rem' }}>No pending tickets in this area.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
      </div>
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

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useTickets } from '../hooks/useTickets'
import { useSocket } from '../hooks/useSocket'
import { PriorityBadge, StatusBadge } from './PriorityBadge'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Mumbai coordinates (default center)
const DEFAULT_CENTER = [19.0760, 72.8777]

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

  const { tickets, loading, addOrUpdateTicket } = useTickets({ status: 'Pending', page_size: 100 })
  const { connected, lastEvent } = useSocket('all')

  // ── Initialize Map ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    const map = L.map(mapContainer.current, {
      zoomControl: false,
      attributionControl: false
    }).setView(DEFAULT_CENTER, 11)

    // Using CartoDB dark matter as a free dark-themed tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ── Add / update markers ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return

    tickets.forEach(ticket => {
      const { ticket_id, location, severity_tier, priority_score } = ticket
      if (!location?.lat || !location?.lng) return

      const color = TIER_COLORS[severity_tier] || TIER_COLORS.Low
      const size = Math.max(12, Math.min(30, 10 + (priority_score || 0) / 5))

      if (markersRef.current[ticket_id]) {
        // Update existing marker
        const icon = L.divIcon({
          className: 'custom-icon',
          html: `<div class="map-marker" style="width: ${size}px; height: ${size}px; border-radius: 50%; background: ${color}40; border: 2px solid ${color}; box-shadow: 0 0 ${size}px ${color}60; cursor: pointer;"></div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2]
        })
        markersRef.current[ticket_id].setIcon(icon)
      } else {
        // Create new marker
        const icon = L.divIcon({
          className: 'custom-icon',
          html: `<div class="map-marker" style="width: ${size}px; height: ${size}px; border-radius: 50%; background: ${color}40; border: 2px solid ${color}; box-shadow: 0 0 ${size}px ${color}60; cursor: pointer; transition: all 0.4s"></div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2]
        })

        const marker = L.marker([location.lat, location.lng], { icon })
          .addTo(mapRef.current)
          .on('click', () => setSelectedTicket(ticket))

        markersRef.current[ticket_id] = marker
      }
    })
  }, [tickets])

  // ── Real-time WebSocket updates ─────────────────────────────────────────────
  useEffect(() => {
    if (!lastEvent) return
    if (lastEvent.type === 'ticket.update' || lastEvent.type === 'priority.boost') {
      addOrUpdateTicket(lastEvent.data)
    }
  }, [lastEvent, addOrUpdateTicket])

  return (
    <div style={{ position: 'relative', height: 'calc(100vh - 120px)' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%', borderRadius: 'var(--radius-lg)' }} />

      {/* Overlay Controls */}
      <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 1000 }}>
        <div className="card card-sm" style={{ minWidth: 200, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className={`status-dot${connected ? ' live' : ''}`} style={{ background: connected ? '#22c55e' : '#f97316' }} />
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{connected ? 'Live' : 'Connecting...'}</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {tickets.length} active tickets
          </div>
        </div>
        {/* Legend */}
        <div className="card card-sm" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
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
        <div style={{ position: 'absolute', bottom: 24, right: 24, width: 360, zIndex: 1000 }}>
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

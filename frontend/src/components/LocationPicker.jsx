import React, { useEffect, useRef, useState } from 'react'

const DEFAULT_CENTER = [19.0760, 72.8777] // Mumbai [lat, lng]

export default function LocationPicker({ value, onChange }) {
  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    const L = window.L
    if (!L) return

    const map = L.map(mapContainer.current, {
      zoomControl: true,
      attributionControl: false
    }).setView(value ? [value.lat, value.lng] : DEFAULT_CENTER, 13)

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CartoDB'
    }).addTo(map)

    // Initial Marker
    if (value) {
      markerRef.current = L.marker([value.lat, value.lng], { draggable: true }).addTo(map)
      markerRef.current.on('dragend', (e) => {
        const { lat, lng } = e.target.getLatLng()
        onChange({ lat, lng })
      })
    }

    // Click to pin
    map.on('click', (e) => {
      const { lat, lng } = e.latlng
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng])
      } else {
        markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(map)
        markerRef.current.on('dragend', (ev) => {
          const { lat, lng } = ev.target.getLatLng()
          onChange({ lat, lng })
        })
      }
      onChange({ lat, lng })
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Sync map with external value updates (e.g., Capture GPS)
  useEffect(() => {
    if (!mapRef.current || !value) return
    const L = window.L
    
    // Check if marker needs repositioning
    if (markerRef.current) {
      const curr = markerRef.current.getLatLng()
      if (curr.lat !== value.lat || curr.lng !== value.lng) {
        markerRef.current.setLatLng([value.lat, value.lng])
        mapRef.current.setView([value.lat, value.lng], 15)
      }
    } else {
      markerRef.current = L.marker([value.lat, value.lng], { draggable: true }).addTo(mapRef.current)
      markerRef.current.on('dragend', (e) => {
        const { lat, lng } = e.target.getLatLng()
        onChange({ lat, lng })
      })
      mapRef.current.setView([value.lat, value.lng], 15)
    }
  }, [value])

  return (
    <div style={{ position: 'relative', width: '100%', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)' }}>
      <div ref={mapContainer} style={{ height: 260, width: '100%' }} />
      <div style={{ 
        position: 'absolute', 
        top: 10, 
        right: 10, 
        zIndex: 1000,
        background: 'rgba(15, 22, 36, 0.8)',
        padding: '4px 10px',
        borderRadius: 'var(--radius-sm)',
        fontSize: '0.7rem',
        color: 'var(--text-accent)',
        pointerEvents: 'none'
      }}>
        🖱 Click to set location · Draggable pin
      </div>
    </div>
  )
}

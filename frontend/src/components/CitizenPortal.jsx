import React, { useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { submitComplaint } from '../utils/api'

const CATEGORIES = [
  { value: 'Pothole',         icon: '🕳️', label: 'Pothole' },
  { value: 'Flooding',        icon: '🌊', label: 'Flooding' },
  { value: 'Drainage',        icon: '🚰', label: 'Drainage' },
  { value: 'Street Light',    icon: '💡', label: 'Street Light' },
  { value: 'Garbage',         icon: '🗑️', label: 'Garbage' },
  { value: 'Water Supply',    icon: '💧', label: 'Water Supply' },
  { value: 'Building Hazard', icon: '🏚️', label: 'Building Hazard' },
  { value: 'Live Wire',       icon: '⚡', label: 'Live Wire' },
  { value: 'Noise',           icon: '🔊', label: 'Noise' },
  { value: 'Other',           icon: '📋', label: 'Other' },
]

function imageToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function getImageHash(base64) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function CitizenPortal({ onSubmitted }) {
  const [step, setStep] = useState('form') // form | submitting | success | error
  const [result, setResult] = useState(null)

  const [description, setDescription] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [useGPS, setUseGPS] = useState(true)
  const [gpsCoords, setGpsCoords] = useState(null)
  const [gpsError, setGpsError] = useState(null)
  const [language, setLanguage] = useState('en')

  // ── GPS capture ─────────────────────────────────────────────────────────────
  const captureGPS = () => {
    if (!navigator.geolocation) {
      setGpsError('GPS not available in this browser')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGpsError(null)
      },
      () => setGpsError('GPS access denied — your description will be used for geocoding'),
    )
  }

  // ── Image drop ───────────────────────────────────────────────────────────────
  const onDrop = useCallback((acceptedFiles) => {
    const file = acceptedFiles[0]
    if (file) {
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  })

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!description.trim()) return

    setStep('submitting')

    try {
      const payload = {
        description: description.trim(),
        language,
        latitude: gpsCoords?.lat || null,
        longitude: gpsCoords?.lng || null,
      }

      if (imageFile) {
        const base64 = await imageToBase64(imageFile)
        const hash = await getImageHash(base64)
        payload.image_base64 = base64
        payload.sha256_hash = hash
      }

      const response = await submitComplaint(payload)
      setResult(response.data)
      setStep('success')
      onSubmitted?.(response.data)
    } catch (err) {
      console.error('Submission error:', err)

      // Map HTTP status codes to friendly messages
      const status = err.response?.status
      let friendlyMessage = 'Unable to submit. Please check your connection and try again.'

      if (status === 401) {
        friendlyMessage = 'Session expired. Your token was refreshed — please submit again.'
      } else if (status === 422) {
        const details = err.response?.data?.detail
        if (Array.isArray(details)) {
          friendlyMessage = details.map(d => d.msg).join('; ')
        } else {
          friendlyMessage = 'Invalid submission data. Please check your description.'
        }
      } else if (status === 429) {
        friendlyMessage = 'Too many submissions! Please wait 60 seconds before trying again.'
      } else if (status === 400) {
        friendlyMessage = err.response?.data?.detail || 'Bad request — please check your inputs.'
      } else if (!status) {
        // Network error / gateway not running
        friendlyMessage = 'Cannot reach server. Make sure the backend is running on port 8000.'
      }

      setResult({ message: friendlyMessage })
      setStep('error')
    }
  }

  // ── Success Modal Popup ──────────────────────────────────────────────────────
  if (step === 'success' && result) {
    return (
      <>
        {/* Modal backdrop */}
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px',
          animation: 'fadeIn 0.25s ease',
        }}>
          {/* Modal card */}
          <div style={{
            background: 'linear-gradient(145deg, #0f172a, #1e293b)',
            border: '1px solid rgba(34,197,94,0.35)',
            borderRadius: '20px',
            padding: '40px 36px',
            maxWidth: 480,
            width: '100%',
            boxShadow: '0 0 60px rgba(34,197,94,0.15), 0 24px 64px rgba(0,0,0,0.6)',
            animation: 'slideUp 0.3s cubic-bezier(0.22,1,0.36,1)',
            textAlign: 'center',
          }}>
            {/* Icon */}
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'rgba(34,197,94,0.15)',
              border: '2px solid rgba(34,197,94,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '2rem', margin: '0 auto 20px',
            }}>✅</div>

            <h2 style={{ color: '#4ade80', marginBottom: 6, fontSize: '1.4rem' }}>
              Request Submitted!
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: 28 }}>
              {result.message}
            </p>

            {/* Info grid */}
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: 24,
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}>
              {/* Ticket ID / Token Number */}
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                  🎟 Token / Ticket Number
                </div>
                <div style={{
                  fontFamily: 'monospace', fontSize: '1.35rem', fontWeight: 800,
                  color: '#60a5fa',
                  letterSpacing: '0.04em',
                  background: 'rgba(59,130,246,0.1)',
                  border: '1px solid rgba(59,130,246,0.25)',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  display: 'inline-block',
                }}>
                  {result.ticket_id}
                </div>
              </div>

              {/* Status */}
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                  📊 Current Status
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: '#22c55e',
                    boxShadow: '0 0 8px #22c55e',
                    display: 'inline-block', flexShrink: 0,
                  }} />
                  <span style={{ color: '#4ade80', fontWeight: 600, fontSize: '0.95rem' }}>
                    {result.status}
                  </span>
                </div>
              </div>

              {/* Processing time */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px',
                background: 'rgba(99,102,241,0.08)',
                borderRadius: '8px',
                fontSize: '0.8rem', color: 'var(--text-muted)',
              }}>
                <span>⚡</span>
                <span>AI classification running in background (~{result.estimated_processing_ms}ms)</span>
              </div>
            </div>

            {/* Save ticket note */}
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 20 }}>
              💡 Save your token number to track status at the <strong style={{ color: 'var(--text-secondary)' }}>Track</strong> page.
            </p>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setStep('form'); setDescription(''); setImageFile(null); setImagePreview(null)
                  setGpsCoords(null); setResult(null)
                }}
              >
                ＋ Submit Another
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  // Copy ticket ID to clipboard
                  navigator.clipboard?.writeText(result.ticket_id).catch(() => {})
                  const btn = document.activeElement
                  if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => { btn.textContent = '📋 Copy Token' }, 2000) }
                }}
              >
                📋 Copy Token
              </button>
            </div>
          </div>
        </div>

        {/* Keep the form rendered behind the modal */}
        <div style={{ maxWidth: 640, margin: '0 auto', opacity: 0.3, pointerEvents: 'none', userSelect: 'none' }}>
          <form style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="form-group">
              <label className="form-label">Describe the issue *</label>
              <textarea className="textarea" rows={4} disabled value={description} readOnly />
            </div>
          </form>
        </div>
      </>
    )
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Description */}
        <div className="form-group">
          <label className="form-label">Describe the issue *</label>
          <textarea
            className="textarea"
            placeholder="e.g. Deep pothole near SV Road, Andheri. Large vehicles swerving suddenly. Very dangerous! / बड़ा गड्ढा है रास्ते में..."
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={4}
            required
          />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right' }}>
            {description.length}/2000 · Hindi/English/Hinglish supported
          </span>
        </div>

        {/* Language select */}
        <div className="form-group">
          <label className="form-label">Input Language</label>
          <select className="select" value={language} onChange={e => setLanguage(e.target.value)}>
            <option value="en">English</option>
            <option value="hi">हिंदी (Hindi)</option>
            <option value="hi-en">Hinglish</option>
            <option value="mr">मराठी (Marathi)</option>
          </select>
        </div>

        {/* Photo Upload */}
        <div className="form-group">
          <label className="form-label">Photo (optional but recommended)</label>
          {imagePreview ? (
            <div style={{ position: 'relative' }}>
              <img src={imagePreview} alt="Preview" className="dropzone-preview" />
              <button
                type="button"
                className="btn btn-danger btn-sm"
                style={{ position: 'absolute', top: 8, right: 8 }}
                onClick={() => { setImageFile(null); setImagePreview(null) }}
              >
                ✕ Remove
              </button>
              <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                🔒 EXIF metadata stripped · GPS extracted separately
              </div>
            </div>
          ) : (
            <div {...getRootProps()} className={`dropzone${isDragActive ? ' active' : ''}`}>
              <input {...getInputProps()} />
              <div className="dropzone-icon">📷</div>
              <div className="dropzone-text">
                {isDragActive ? 'Drop to upload...' : 'Drag & drop or click to upload'}
                <br />
                <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>JPG, PNG, WebP · Max 10MB</span>
              </div>
            </div>
          )}
        </div>

        {/* GPS */}
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={useGPS}
              onChange={e => setUseGPS(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            Share Location (improves routing accuracy)
          </label>
          {useGPS && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={captureGPS}>
                📍 Capture GPS
              </button>
              {gpsCoords && (
                <span style={{ color: 'var(--tier-low)', fontSize: '0.8rem' }}>
                  ✓ {gpsCoords.lat.toFixed(5)}, {gpsCoords.lng.toFixed(5)}
                </span>
              )}
              {gpsError && <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{gpsError}</span>}
            </div>
          )}
        </div>

        {/* Privacy notice */}
        <div style={{
          background: 'rgba(59, 130, 246, 0.06)',
          border: '1px solid rgba(59, 130, 246, 0.15)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          fontSize: '0.78rem',
          color: 'var(--text-muted)',
        }}>
          🔒 <strong style={{ color: 'var(--text-secondary)' }}>Privacy Protected</strong>
          · Your identity is HMAC-hashed · GPS is ±30m fuzzed for officers · Photos are AES-256 encrypted · 90-day TTL
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="btn btn-primary btn-lg btn-full"
          disabled={step === 'submitting' || !description.trim()}
        >
          {step === 'submitting' ? (
            <><div className="spinner" style={{ borderTopColor: '#fff' }} /> Submitting...</>
          ) : (
            '🚨 Report Issue'
          )}
        </button>

        {step === 'error' && (
          <div style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}>
            <span style={{ fontSize: '1.2rem', flexShrink: 0, marginTop: 1 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: '#f87171', fontSize: '0.875rem', marginBottom: 4 }}>
                Submission Failed
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                {result?.message || 'Please check your connection and try again.'}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ flexShrink: 0, borderColor: 'rgba(239,68,68,0.4)', color: '#f87171' }}
              onClick={() => { setStep('form'); setResult(null) }}
            >
              Try Again
            </button>
          </div>
        )}
      </form>
    </div>
  )
}

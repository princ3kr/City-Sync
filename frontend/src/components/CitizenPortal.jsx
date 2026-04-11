import React, { useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { submitComplaint } from '../utils/api'
import LocationPicker from './LocationPicker'

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
  const [errorMessage, setErrorMessage] = useState('')

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
      () => setGpsError('GPS access denied — please pin location manually on the map'),
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
      let msg = 'Submission failed. Please check your connection and try again.'
      if (err.response?.data) {
        const detail = err.response.data.detail
        if (Array.isArray(detail)) {
          msg = detail.map(d => `${d.loc ? d.loc[d.loc.length - 1] : 'field'}: ${d.msg}`).join(', ')
        } else if (typeof detail === 'string') {
          msg = detail
        } else if (err.response.data.message) {
          msg = err.response.data.message
        }
      }
      setErrorMessage(msg)
      setStep('error')
    }
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (step === 'success' && result) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <div style={{ fontSize: '4rem', marginBottom: 16 }}>✅</div>
        <h2 style={{ color: 'var(--tier-low)', marginBottom: 12 }}>Complaint Received!</h2>
        <div className="card" style={{ display: 'inline-block', textAlign: 'left', minWidth: 320, marginBottom: 24 }}>
          <div style={{ marginBottom: 12 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>TICKET ID</span>
            <div style={{ fontFamily: 'monospace', fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-accent)' }}>
              {result.ticket_id}
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>STATUS</span>
            <div style={{ color: 'var(--tier-low)', fontWeight: 600 }}>🔄 {result.status}</div>
          </div>
          <p style={{ fontSize: '0.875rem' }}>{result.message}</p>
          <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            ⏱ AI classification: ~{result.estimated_processing_ms}ms async
          </div>
        </div>
        <div>
          <button className="btn btn-outline btn-sm" onClick={() => {
            setStep('form'); setDescription(''); setImageFile(null); setImagePreview(null)
            setGpsCoords(null); setResult(null)
          }}>
            Submit Another
          </button>
        </div>
      </div>
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

        {/* Location Section */}
        <div className="form-group">
          <label className="form-label">Pin Location *</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={captureGPS}>
                📍 Use My GPS
              </button>
              {gpsError && <span style={{ color: 'var(--tier-critical)', fontSize: '0.75rem' }}>{gpsError}</span>}
              {gpsCoords && (
                <span style={{ color: 'var(--tier-low)', fontSize: '0.75rem', fontWeight: 600 }}>
                  ✓ GPS Captured
                </span>
              )}
            </div>
            
            <LocationPicker value={gpsCoords} onChange={setGpsCoords} />
            
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              * You can move the pin directly on the map for higher accuracy.
            </p>
          </div>
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
          <div style={{ color: 'var(--tier-critical)', textAlign: 'center', fontSize: '0.875rem' }}>
            ✗ {errorMessage || 'Submission failed. Please check your connection and try again.'}
          </div>
        )}
      </form>
    </div>
  )
}

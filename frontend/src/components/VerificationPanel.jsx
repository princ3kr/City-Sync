import React, { useState, useEffect } from 'react'
import { submitStep2, getTicket } from '../utils/api'

export default function VerificationPanel({ ticketId, mode = 'citizen' }) {
  // mode: 'citizen' (step 2) | 'fieldworker' (step 1)
  const [step, setStep] = useState('idle') // idle | submitting | done | error
  const [result, setResult] = useState(null)
  const [response, setResponse] = useState('YES')
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [ticketStatus, setTicketStatus] = useState(undefined)

  useEffect(() => {
    if (!ticketId || mode !== 'citizen') return
    let cancelled = false
    const load = async () => {
      try {
        const res = await getTicket(ticketId)
        if (!cancelled) setTicketStatus(res.data?.status ?? null)
      } catch {
        if (!cancelled) setTicketStatus(false)
      }
    }
    load()
    const t = setInterval(load, 8000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [ticketId, mode])

  const handlePhotoChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setPhoto(file)
      setPhotoPreview(URL.createObjectURL(file))
    }
  }

  const handleCitizenSubmit = async () => {
    setStep('submitting')
    try {
      let photoBase64 = null
      if (photo && response !== 'YES' && response !== 'NO') {
        const reader = new FileReader()
        photoBase64 = await new Promise((res, rej) => {
          reader.onload = () => res(reader.result.split(',')[1])
          reader.onerror = rej
          reader.readAsDataURL(photo)
        })
      }

      const res = await submitStep2({
        ticket_id: ticketId,
        citizen_response: response,
        photo_base64: photoBase64,
      })
      setResult(res.data)
      setStep('done')
    } catch (err) {
      console.error(err)
      setStep('error')
    }
  }

  if (step === 'done' && result) {
    const isResolved = result.result === 'confirmed'
    return (
      <div className="card" style={{ textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>{isResolved ? '✅' : '🔄'}</div>
        <h3 style={{ color: isResolved ? 'var(--tier-low)' : 'var(--accent-blue)', marginBottom: 8 }}>
          {isResolved ? 'Issue Confirmed Resolved!' : 'Issue Reopened'}
        </h3>
        <p style={{ fontSize: '0.875rem' }}>{result.message}</p>
        {result.resolution_method && (
          <div style={{
            marginTop: 16, padding: '8px 16px',
            background: 'rgba(34,197,94,0.1)',
            border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.8rem', color: 'var(--tier-low)',
          }}>
            Resolution: {result.resolution_method} · Ticket closed
          </div>
        )}
      </div>
    )
  }

  if (mode === 'citizen') {
    if (ticketStatus === undefined) {
      return <div className="card skeleton" style={{ height: 120 }} />
    }
    if (ticketStatus === false) {
      return (
        <div className="card">
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Could not load ticket details for verification.</p>
        </div>
      )
    }
    if (ticketStatus !== 'Work Complete') {
      const hint =
        ticketStatus === 'Resolved'
          ? 'This ticket is already closed.'
          : ticketStatus === 'Processing'
            ? 'AI is still classifying your complaint. Citizen confirmation opens after the field team marks the job complete.'
            : 'Citizen confirmation opens when the field team marks your complaint as work complete (status: Work Complete).'
      return (
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>🔍 Step 2 — Confirm Resolution</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{hint}</p>
        </div>
      )
    }
    return (
      <div className="card">
        <h3 style={{ marginBottom: 8 }}>🔍 Step 2 — Confirm Resolution</h3>
        <p style={{ fontSize: '0.875rem', marginBottom: 20 }}>
          The field team has marked your complaint as complete. Please confirm whether the issue has been resolved.
        </p>

        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          {['YES', 'NO', 'PHOTO'].map(opt => (
            <button
              key={opt}
              className={`btn ${response === opt ? 'btn-primary' : 'btn-outline'} btn-full`}
              onClick={() => setResponse(opt)}
            >
              {opt === 'YES' ? '✅ Yes, Fixed' : opt === 'NO' ? '❌ Not Fixed' : '📸 Send Photo'}
            </button>
          ))}
        </div>

        {response === 'PHOTO' && (
          <div style={{ marginBottom: 20 }}>
            <label className="form-label" style={{ display: 'block', marginBottom: 8 }}>
              Upload a photo showing current state
            </label>
            <input type="file" accept="image/*" onChange={handlePhotoChange} className="input" style={{ padding: 8 }} />
            {photoPreview && (
              <img src={photoPreview} alt="preview" style={{ marginTop: 8, width: '100%', height: 150, objectFit: 'cover', borderRadius: 'var(--radius-md)' }} />
            )}
          </div>
        )}

        <div style={{
          padding: '10px 14px', background: 'rgba(59,130,246,0.06)',
          borderRadius: 'var(--radius-md)', fontSize: '0.78rem',
          color: 'var(--text-muted)', marginBottom: 16,
        }}>
          ⏱ 72-hour window · If no response, ticket auto-closes as "timeout"
        </div>

        <button
          className="btn btn-teal btn-full"
          disabled={step === 'submitting' || (response === 'PHOTO' && !photo)}
          onClick={handleCitizenSubmit}
        >
          {step === 'submitting' ? (
            <><div className="spinner" style={{ borderTopColor: '#fff' }} /> Submitting...</>
          ) : 'Submit Response'}
        </button>

        {step === 'error' && (
          <div style={{ color: 'var(--tier-critical)', marginTop: 12, fontSize: '0.875rem', textAlign: 'center' }}>
            ✗ Submission failed. Please try again.
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="card">
      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
        Field worker verification panel — upload the after-photo via the field worker portal.
      </p>
    </div>
  )
}

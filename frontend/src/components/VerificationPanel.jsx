import React, { useState, useEffect } from 'react'
import { submitStep2, getTicket } from '../utils/api'

export default function VerificationPanel({ ticketId, mode = 'citizen' }) {
  // mode: 'citizen' (step 2) | 'fieldworker' (step 1)
  const [step, setStep] = useState('idle') // idle | submitting | done | error
  const [result, setResult] = useState(null)
  const [response, setResponse] = useState('YES')
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [ticketStatus, setTicketStatus] = useState(null)

  // Poll ticket status to know when to show the verification form
  useEffect(() => {
    if (!ticketId) return
    const fetchStatus = async () => {
      try {
        const res = await getTicket(ticketId)
        setTicketStatus(res.data?.status || null)
      } catch (_) {}
    }
    fetchStatus()
    const interval = setInterval(fetchStatus, 8000)
    return () => clearInterval(interval)
  }, [ticketId])

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
      if (photo && response === 'PHOTO') {
        const reader = new FileReader()
        photoBase64 = await new Promise((res, rej) => {
          reader.onload = () => res(reader.result.split(',')[1])
          reader.onerror = rej
          reader.readAsDataURL(photo)
        })
      }

      const res = await submitStep2({
        ticket_id: ticketId,
        citizen_response: response === 'PHOTO' ? 'NO' : response,
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

  // Only show citizen verification when field team has marked it complete
  if (mode === 'citizen') {
    if (ticketStatus === 'Resolved') {
      return (
        <div className="card" style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>✅</div>
          <h3 style={{ color: 'var(--tier-low)', marginBottom: 4 }}>Issue Resolved</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>This complaint has been resolved and closed.</p>
        </div>
      )
    }

    if (ticketStatus !== 'Work Complete') {
      // Status-aware waiting messages
      const statusMessages = {
        'Pending':       { icon: '📥', msg: 'Your complaint has been received and is in the queue.' },
        'Processing':    { icon: '🤖', msg: 'AI is classifying your complaint and routing it to the right department.' },
        'In Progress':   { icon: '🔧', msg: 'A field team is working on the issue. You\'ll be notified when work is complete.' },
        'Human Review':  { icon: '👁', msg: 'Your complaint is under manual review by our team.' },
        'Rejected':      { icon: '❌', msg: 'This complaint was flagged as spam or duplicate.' },
        null:            { icon: '⏳', msg: 'Loading ticket status...' },
      }
      const { icon, msg } = statusMessages[ticketStatus] ?? { icon: '⏳', msg: 'Checking ticket status...' }
      return (
        <div className="card" style={{
          background: 'rgba(59,130,246,0.04)',
          border: '1px solid rgba(59,130,246,0.15)',
          padding: '20px 24px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '1.8rem' }}>{icon}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 4 }}>
                Verification not yet available
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                {msg}
              </p>
            </div>
          </div>
          {ticketStatus && ticketStatus !== 'Rejected' && ticketStatus !== 'Resolved' && (
            <div style={{ marginTop: 14, fontSize: '0.75rem', color: 'var(--text-muted)', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              ⏳ The <strong>Step 2 — Confirm Resolution</strong> form will appear here once the field team marks the work as complete.
            </div>
          )}
        </div>
      )
    }

    // Status is Work Complete — show the confirmation form
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

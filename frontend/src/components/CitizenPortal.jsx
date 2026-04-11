import React, { useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, MapPin, Send, Mic, ArrowLeft, CheckCircle, AlertCircle, X, Copy, ExternalLink } from 'lucide-react'
import { submitComplaint } from '../utils/api'
import StatusTimeline from './StatusTimeline'

const CATEGORIES = [
  { value: 'Pothole',         icon: '🕳️', desc: 'Broken road surface' },
  { value: 'Flooding',        icon: '🌊', desc: 'Water accumulation' },
  { value: 'Drainage',        icon: '🚰', desc: 'Blocked sewage' },
  { value: 'Street Light',    icon: '💡', desc: 'Lights not working' },
  { value: 'Garbage',         icon: '🗑️', desc: 'Waste buildup' },
  { value: 'Water Supply',    icon: '💧', desc: 'No water/Leakage' },
  { value: 'Live Wire',       icon: '⚡', desc: 'Electrical hazard' },
  { value: 'Other',           icon: '📋', desc: 'Anything else' },
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
  const [wizardStep, setWizardStep] = useState(0) // 0: Category, 1: Media, 2: Details
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [gpsCoords, setGpsCoords] = useState(null)
  const [isListening, setIsListening] = useState(false)

  // ── Handlers ───────────────────────────────────────────────────────────────
  const captureGPS = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.error(err)
    )
  }

  const startVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Voice recognition not supported in this browser.')
      return
    }
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.onstart = () => setIsListening(true)
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript
      setDescription(prev => (prev ? prev + ' ' + transcript : transcript))
    }
    recognition.onend = () => setIsListening(false)
    recognition.start()
  }

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: (files) => {
      const file = files[0]
      if (file) {
        setImageFile(file)
        setImagePreview(URL.createObjectURL(file))
        setWizardStep(2) // Auto-advance to details after photo
      }
    },
    accept: { 'image/*': ['.jpg', '.jpeg', '.png'] },
    maxFiles: 1
  })

  const handleFinalSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        description: `${category}: ${description}`,
        latitude: gpsCoords?.lat || null,
        longitude: gpsCoords?.lng || null,
      }
      if (imageFile) {
        const b64 = await imageToBase64(imageFile)
        payload.image_base64 = b64
        payload.sha256_hash = await getImageHash(b64)
      }
      const resp = await submitComplaint(payload)
      setResult(resp.data)
      onSubmitted?.(resp.data)
    } catch (err) {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render Helpers ──────────────────────────────────────────────────────────
  const nextStep = () => setWizardStep(prev => prev + 1)
  const prevStep = () => setWizardStep(prev => prev - 1)

  if (result) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        className="flex-col gap-24"
      >
        <div className="card text-center" style={{ padding: '32px 24px', background: 'var(--grad-hero)', border: 'none' }}>
          <div className="flex-center mx-auto mb-16" style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--tier-low)', color: 'white' }}>
            <CheckCircle size={32} />
          </div>
          <h2 className="mb-4" style={{ color: 'white' }}>Report Received!</h2>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem' }}>
            Your issue has been logged and sent to the municipal team.
          </p>
        </div>

        <div className="flex-col gap-12">
          <div className="flex justify-between items-center px-8">
            <span className="text-xs font-bold opacity-60 uppercase">Ticket Token</span>
            <span className="text-xs font-bold opacity-60 uppercase">Live Tracking</span>
          </div>
          <div className="card card-sm bg-surface flex justify-between items-center">
            <code className="text-accent font-bold" style={{ fontSize: '1.2rem' }}>{result.ticket_id}</code>
            <button 
              className="btn btn-ghost btn-sm" 
              onClick={() => {
                navigator.clipboard.writeText(result.ticket_id)
                alert('Ticket ID copied to clipboard!')
              }}
            >
              <Copy size={16} className="mr-4" /> Copy
            </button>
          </div>
        </div>

        <div className="card bg-elevated">
          <StatusTimeline ticketId={result.ticket_id} />
        </div>

        <div className="flex gap-12 mt-8">
          <button className="btn btn-primary btn-full" onClick={() => window.location.reload()}>
            New Report
          </button>
          <button className="btn btn-outline btn-full" onClick={() => window.location.href = '/track'}>
            <ExternalLink size={16} className="mr-8" /> Track All
          </button>
        </div>
      </motion.div>
    )
  }

  const variants = {
    enter: (direction) => ({ x: direction > 0 ? 300 : -300, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (direction) => ({ x: direction < 0 ? 300 : -300, opacity: 0 })
  }

  return (
    <div className="citizen-portal">
      {/* Progress Bar */}
      <div style={{ marginBottom: 32, height: 4, background: 'var(--bg-elevated)', borderRadius: 2 }}>
        <motion.div 
          animate={{ width: `${(wizardStep + 1) * 33.3}%` }} 
          style={{ height: '100%', background: 'var(--grad-accent)', borderRadius: 2 }} 
        />
      </div>

      <AnimatePresence mode="wait" custom={wizardStep}>
        {wizardStep === 0 && (
          <motion.div
            key="step0" custom={wizardStep} variants={variants} initial="enter" animate="center" exit="exit"
            className="flex-col gap-20"
          >
            <div className="text-center">
              <h2 className="mb-4">What's the issue?</h2>
              <p>Select a category that matches your problem.</p>
            </div>
            <div className="grid-2" style={{ gap: 12 }}>
              {CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  className={`card card-sm flex-col items-center gap-8 ${category === cat.value ? 'animate-glow' : ''}`}
                  style={{ 
                    cursor: 'pointer', textAlign: 'center', 
                    border: category === cat.value ? '2px solid var(--neon-blue)' : '1px solid var(--border)' 
                  }}
                  onClick={() => { setCategory(cat.value); nextStep() }}
                >
                  <span style={{ fontSize: '2rem' }}>{cat.icon}</span>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{cat.value}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{cat.desc}</div>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {wizardStep === 1 && (
          <motion.div
            key="step1" custom={wizardStep} variants={variants} initial="enter" animate="center" exit="exit"
            className="flex-col gap-20"
          >
            <div className="flex items-center gap-12 mb-4">
              <button onClick={prevStep} className="btn btn-ghost btn-sm p-0"><ArrowLeft size={20}/></button>
              <h2 className="m-0">Add a Photo</h2>
            </div>
            {imagePreview ? (
              <div className="relative">
                <img src={imagePreview} className="dropzone-preview" style={{ height: 350 }} />
                <button 
                  className="btn btn-danger btn-sm absolute top-8 right-8" 
                  onClick={() => { setImageFile(null); setImagePreview(null) }}
                >
                  <X size={16}/> Remove
                </button>
                <div className="mt-16 flex gap-12">
                  <button className="btn btn-primary btn-full" onClick={nextStep}>Looks Good</button>
                </div>
              </div>
            ) : (
              <div {...getRootProps()} className="dropzone animate-float" style={{ minHeight: 300, background: 'rgba(59,130,246,0.05)' }}>
                <input {...getInputProps()} />
                <Camera size={48} className="mb-16 text-muted" />
                <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>Tap to Take a Photo</div>
                <p className="text-sm">Or drag and drop here</p>
                <button className="btn btn-outline mt-16" onClick={nextStep}>Skip Photo</button>
              </div>
            )}
          </motion.div>
        )}

        {wizardStep === 2 && (
          <motion.div
            key="step2" custom={wizardStep} variants={variants} initial="enter" animate="center" exit="exit"
            className="flex-col gap-20"
          >
            <div className="flex items-center gap-12 mb-4">
              <button onClick={prevStep} className="btn btn-ghost btn-sm p-0"><ArrowLeft size={20}/></button>
              <h2 className="m-0">Final Details</h2>
            </div>

            <div className="form-group relative">
              <label className="form-label">Say or type a few words</label>
              <textarea
                className="textarea"
                placeholder="What exactly is the problem?"
                value={description}
                onChange={e => setDescription(e.target.value)}
                style={{ paddingRight: 48 }}
              />
              <button 
                type="button" 
                className={`absolute bottom-12 right-12 btn btn-sm ${isListening ? 'btn-danger' : 'btn-ghost'}`}
                onClick={startVoiceInput}
                title="Tap to speak"
              >
                <Mic size={20} className={isListening ? 'animate-pulse' : ''} />
              </button>
            </div>

            <div className="card card-sm bg-surface">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-8">
                  <MapPin size={20} color={gpsCoords ? 'var(--tier-low)' : 'var(--text-muted)'} />
                  <span style={{ fontSize: '0.85rem' }}>
                    {gpsCoords ? 'Location captured ✓' : 'Add location for faster help'}
                  </span>
                </div>
                {!gpsCoords && (
                  <button className="btn btn-teal btn-sm" onClick={captureGPS}>Add Now</button>
                )}
              </div>
            </div>

            <button 
              className="btn btn-primary btn-lg mt-16 animate-glow" 
              onClick={handleFinalSubmit}
              disabled={submitting || !description.trim()}
            >
              {submitting ? 'Sending...' : 'Report Now 🚨'}
            </button>

            {error && <div className="text-center text-sm" style={{ color: 'var(--tier-critical)' }}>{error}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, AlertTriangle, ThumbsUp, ThumbsDown, Camera, X } from 'lucide-react'
import { submitStep2 } from '../utils/api'

export default function VerificationPanel({ ticketId, mode = 'citizen' }) {
  const [verifying, setVerifying] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  
  const handleVerify = async (confirmed) => {
    setVerifying(true)
    setError(null)
    try {
      await submitStep2({ 
        ticket_id: ticketId,
        confirmed, 
        role: mode,
        timestamp: new Date().toISOString()
      })
      setDone(true)
    } catch (err) {
      setError('Connection error. Please try again.')
    } finally {
      setVerifying(false)
    }
  }

  if (done) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card bg-surface text-center">
        <CheckCircle className="mx-auto mb-12" color="var(--tier-low)" />
        <h4 className="mb-4">Verification Submitted</h4>
        <p className="text-sm">Thank you for helping keep the city clean!</p>
      </motion.div>
    )
  }

  return (
    <div className="card" style={{ border: '1px solid var(--accent-teal)', background: 'rgba(20, 184, 166, 0.03)' }}>
      <div className="flex gap-12 items-start mb-20">
        <div className="flex-center" style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--grad-teal)', boxShadow: 'var(--glow-teal)' }}>
          <CheckCircle fontVariant="white" color="white" size={24} />
        </div>
        <div>
          <h4 className="m-0">Is it fixed?</h4>
          <p className="text-sm m-0">Please tell us if you're happy with the resolution.</p>
        </div>
      </div>

      <div className="flex gap-12">
        <button 
          className="btn btn-teal btn-full" 
          onClick={() => handleVerify(true)}
          disabled={verifying}
        >
          <ThumbsUp size={18} /> Yes, All Good!
        </button>
        <button 
          className="btn btn-outline btn-full" 
          onClick={() => handleVerify(false)}
          disabled={verifying}
          style={{ borderColor: 'var(--tier-critical)', color: 'var(--tier-critical)' }}
        >
          <ThumbsDown size={18} /> Not Fixed
        </button>
      </div>

      {error && <div className="mt-12 text-center text-xs" style={{ color: 'var(--tier-critical)' }}>{error}</div>}
      
      <div className="mt-20 pt-16 border-t" style={{ borderTop: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        <AlertTriangle size={12} className="inline mr-4" /> 
        Final confirmation is required before we can officially close this ticket.
      </div>
    </div>
  )
}

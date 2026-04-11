import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Clock, Truck, ShieldCheck, HelpCircle } from 'lucide-react'
import { getTicket } from '../utils/api'

const STATUS_CONFIG = {
  'Pending': { icon: <Clock size={16}/>, color: 'var(--text-muted)', label: 'Received' },
  'Classified': { icon: <ShieldCheck size={16}/>, color: 'var(--accent-blue)', label: 'AI Classified' },
  'Routed': { icon: <Truck size={16}/>, color: 'var(--accent-cyan)', label: 'In Transit' },
  'In Progress': { icon: <Clock size={16}/>, color: 'var(--tier-high)', label: 'Working on it' },
  'Resolved': { icon: <Check size={16}/>, color: 'var(--tier-low)', label: 'Solved!' },
  'Rejected': { icon: <HelpCircle size={16}/>, color: 'var(--tier-critical)', label: 'Needs Info' },
}

const STEPS = ['Pending', 'Classified', 'Routed', 'In Progress', 'Resolved']

export default function StatusTimeline({ ticketId }) {
  const [ticket, setTicket] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let interval
    const fetchStatus = async () => {
      try {
        const resp = await getTicket(ticketId)
        setTicket(resp.data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchStatus()
    interval = setInterval(fetchStatus, 10000) // Poll every 10s
    return () => clearInterval(interval)
  }, [ticketId])

  if (loading) {
    return <div className="skeleton" style={{ height: 100, width: '100%' }} />
  }

  if (!ticket) {
    return (
      <div className="card text-center" style={{ borderStyle: 'dashed', borderColor: 'var(--tier-critical)' }}>
        <HelpCircle className="mx-auto mb-8" size={32} color="var(--tier-critical)" />
        <p style={{ margin: 0 }}>Ticket <span className="font-mono">{ticketId}</span> not found.</p>
        <p className="text-sm mt-8 opacity-70">Please check the ticket ID and try again.</p>
      </div>
    )
  }

  const currentStatusIndex = STEPS.indexOf(ticket.status)

  return (
    <div className="status-timeline-container">
      <div className="flex justify-between items-center mb-24">
        <div>
          <div className="text-sm font-bold opacity-60">TICKET STATUS</div>
          <h3 className="m-0" style={{ color: STATUS_CONFIG[ticket.status]?.color }}>
            {STATUS_CONFIG[ticket.status]?.label || ticket.status}
          </h3>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="text-sm font-bold opacity-60 uppercase">Priority</div>
          <div style={{ color: ticket.priority_score > 70 ? 'var(--tier-critical)' : 'var(--tier-low)', fontWeight: 800 }}>
            {ticket.priority_score > 70 ? '⚡ HIGH' : 'NORMAL'}
          </div>
        </div>
      </div>

      <div className="timeline-horizontal" style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '10px 0' }}>
        {/* Connection Line */}
        <div style={{ position: 'absolute', top: 22, left: 10, right: 10, height: 2, background: 'var(--bg-elevated)', zIndex: 0 }} />
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, currentStatusIndex) * (100 / (STEPS.length - 1))}%` }}
          style={{ position: 'absolute', top: 22, left: 10, height: 2, background: 'var(--grad-accent)', zIndex: 1 }} 
        />

        {STEPS.map((step, idx) => {
          const isDone = idx < currentStatusIndex || ticket.status === 'Resolved'
          const isActive = idx === currentStatusIndex && ticket.status !== 'Resolved'
          const config = STATUS_CONFIG[step] || { icon: <Check size={16}/>, color: 'var(--text-muted)', label: step }

          return (
            <div key={step} style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', width: 60 }}>
              <motion.div
                initial={false}
                animate={{ 
                  scale: isActive ? 1.2 : 1,
                  background: isDone || isActive ? 'var(--grad-accent)' : 'var(--bg-elevated)',
                  boxShadow: isActive ? 'var(--neon-glow)' : 'none'
                }}
                className={`flex-center ${isActive ? 'animate-glow' : ''}`}
                style={{ width: 28, height: 28, borderRadius: '50%', color: isDone || isActive ? '#fff' : 'var(--text-muted)', border: '2px solid var(--bg-base)' }}
              >
                {isDone ? <Check size={14} strokeWidth={3} /> : config.icon}
              </motion.div>
              <div 
                style={{ 
                  marginTop: 12, fontSize: '0.6rem', fontWeight: 800, textAlign: 'center', 
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.05em'
                }}
              >
                {config.label}
              </div>
            </div>
          )
        })}
      </div>

      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ marginTop: 32, padding: 16, background: 'rgba(59,130,246,0.05)', borderRadius: 12, border: '1px solid var(--border)' }}
      >
        <div className="flex gap-12 items-start">
          <div className="flex-center" style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-elevated)' }}>
            🤖
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: 4 }}>Last Update</div>
            <p style={{ fontSize: '0.85rem', margin: 0 }}>
              {ticket.status === 'Pending' ? 'AI is currently analyzing your report. This usually takes less than 1 second.' : 
               ticket.status === 'Classified' ? `Recognized as ${ticket.category}. Forwarding to the municipal team.` :
               ticket.status === 'Routed' ? 'On its way! The department has been notified.' :
               'Local team is resolving the issue. We\'ll notify you once it\'s done!'}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

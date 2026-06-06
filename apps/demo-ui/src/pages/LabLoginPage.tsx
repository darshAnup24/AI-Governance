import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useLabAuth } from '../contexts/LabAuthContext'
import { Button, Input } from '@airlock/shared-ui'
import { FlaskConical, Terminal, ArrowRight } from 'lucide-react'

const easeOut = [0.16, 1, 0.3, 1] as const

export default function LabLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, isAuthenticated } = useLabAuth()
  const navigate = useNavigate()

  if (isAuthenticated) {
    navigate('/lab', { replace: true })
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/lab')
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex">
      {/* Left Panel */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, ease: easeOut }}
        className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-emerald-700 to-emerald-900 relative overflow-hidden items-center justify-center"
      >
        <div className="bg-dot-pattern absolute inset-0" />
        <div className="relative z-10 px-16 max-w-lg">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: easeOut, delay: 0.2 }}
          >
            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center mb-8">
              <FlaskConical className="w-7 h-7 text-white" />
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)' }} className="text-4xl text-white leading-[1.1] mb-4">
              Airlock
              <br />
              <span className="text-emerald-300">Lab Environment</span>
            </h1>
            <p className="text-white/60 text-base leading-relaxed">
              Demo, sandbox, and simulation environment for testing AI governance features.
            </p>
          </motion.div>
        </div>
      </motion.div>

      {/* Right Panel */}
      <div className="flex-1 flex items-center justify-center p-4 lg:p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: easeOut, delay: 0.1 }}
          className="w-full max-w-sm"
        >
          <div className="lg:hidden text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center mx-auto mb-5 shadow-[0_4px_14px_rgba(16,185,129,0.25)]">
              <FlaskConical className="w-7 h-7 text-white" />
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)' }} className="text-3xl text-[var(--foreground)] leading-tight">
              Airlock Lab
            </h1>
            <p className="text-sm text-[var(--muted-foreground)] mt-2">Demo, Sandbox & Simulation</p>
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/5 text-amber-600 text-xs border border-amber-500/20">
              <Terminal className="w-3 h-3" />
              Internal Use Only
            </div>
          </div>

          <div className="hidden lg:block mb-8">
            <h2 style={{ fontFamily: 'var(--font-display)' }} className="text-3xl text-[var(--foreground)] leading-tight">
              Lab Access
            </h2>
            <p className="text-sm text-[var(--muted-foreground)] mt-2">Sign in to the demo environment</p>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-5">
              <Input label="Email" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="demo@airlock.io" required />
              <Input label="Password" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="Lab access password" required />
              {error && (
                <p className="text-sm text-red-500 bg-red-500/5 rounded-xl px-4 py-2.5 border border-red-500/20">{error}</p>
              )}
              <Button type="submit" loading={loading} className="w-full" icon={<ArrowRight className="w-4 h-4" />}>
                Access Lab
              </Button>
            </form>
          </div>

          <p className="text-center text-xs text-[var(--muted-foreground)]/60 mt-6">
            Airlock Lab v0.1.0 &middot; Internal Demo Environment
          </p>
        </motion.div>
      </div>
    </div>
  )
}

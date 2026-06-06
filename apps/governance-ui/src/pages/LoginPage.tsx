import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext'
import { Button, Input, governanceApi } from '@airlock/shared-ui'
import { Shield, ArrowRight, Activity, Bot, ShieldCheck } from 'lucide-react'

const easeOut = [0.16, 1, 0.3, 1] as const

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [showMfa, setShowMfa] = useState(false)
  const [tempToken, setTempToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  if (isAuthenticated) {
    navigate('/governance', { replace: true })
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/governance')
    } catch (err: any) {
      if (err.mfaRequired) {
        setTempToken(err.tempToken)
        setShowMfa(true)
        setError('')
      } else {
        setError(err.response?.data?.error || err.message || 'Login failed')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await governanceApi.post('/auth/mfa/verify', { tempToken, code: mfaCode })
      const { accessToken } = res.data
      localStorage.setItem('airlock_token', accessToken)
      localStorage.setItem('aigw_token', accessToken)
      window.location.href = '/governance'
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid MFA code')
    } finally {
      setLoading(false)
    }
  }

  if (showMfa) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: easeOut }}
          className="w-full max-w-sm"
        >
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl gradient-icon-bg flex items-center justify-center mx-auto mb-5 shadow-[0_4px_14px_rgba(0,82,255,0.25)]">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <h1
              style={{ fontFamily: 'var(--font-display)' }}
              className="text-3xl text-[var(--foreground)] leading-tight"
            >
              Two-Factor Auth
            </h1>
            <p className="text-sm text-[var(--muted-foreground)] mt-2">
              Enter the code from your authenticator app
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
            <form onSubmit={handleMfaSubmit} className="space-y-5">
              <Input
                label="6-digit code"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder="000000"
                maxLength={6}
                required
              />
              {error && (
                <p className="text-sm text-red-500 bg-red-500/5 rounded-xl px-4 py-2.5 border border-red-500/20">
                  {error}
                </p>
              )}
              <Button type="submit" loading={loading} className="w-full">
                Verify
              </Button>
            </form>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex">
      {/* Left — Hero Panel (hidden on mobile) */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, ease: easeOut }}
        className="hidden lg:flex lg:w-1/2 bg-[var(--foreground)] relative overflow-hidden items-center justify-center"
      >
        <div className="bg-dot-pattern absolute inset-0" />
        <div
          className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-[0.08]"
          style={{ background: 'radial-gradient(circle, var(--accent), transparent 70%)' }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full opacity-[0.06]"
          style={{ background: 'radial-gradient(circle, var(--accent), transparent 70%)' }}
        />

        <div className="relative z-10 px-16 max-w-lg">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: easeOut, delay: 0.2 }}
          >
            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center mb-8">
              <ShieldCheck className="w-7 h-7 text-white" />
            </div>
            <h1
              style={{ fontFamily: 'var(--font-display)' }}
              className="text-4xl text-white leading-[1.1] mb-4"
            >
              AI Governance
              <br />
              <span className="gradient-text">Platform</span>
            </h1>
            <p className="text-[var(--muted-foreground)] text-base leading-relaxed">
              Enterprise-grade monitoring, compliance, and threat detection for your AI estate.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: easeOut, delay: 0.4 }}
            className="mt-12 space-y-5"
          >
            {[
              { icon: Activity, text: 'Real-time prompt monitoring and threat detection' },
              { icon: Shield, text: 'EU AI Act compliance and policy enforcement' },
              { icon: Bot, text: 'Multi-model governance across LLM providers' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                  <item.icon className="w-5 h-5 text-white/70" />
                </div>
                <span className="text-sm text-white/60">{item.text}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </motion.div>

      {/* Right — Login Form */}
      <div className="flex-1 flex items-center justify-center p-4 lg:p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: easeOut, delay: 0.1 }}
          className="w-full max-w-sm"
        >
          {/* Mobile brand mark */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-14 h-14 rounded-2xl gradient-icon-bg flex items-center justify-center mx-auto mb-5 shadow-[0_4px_14px_rgba(0,82,255,0.25)]">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <h1
              style={{ fontFamily: 'var(--font-display)' }}
              className="text-3xl text-[var(--foreground)] leading-tight"
            >
              Airlock
            </h1>
            <p className="text-sm text-[var(--muted-foreground)] mt-2">
              Enterprise AI Governance Platform
            </p>
          </div>

          {/* Desktop title */}
          <div className="hidden lg:block mb-8">
            <h2
              style={{ fontFamily: 'var(--font-display)' }}
              className="text-3xl text-[var(--foreground)] leading-tight"
            >
              Welcome back
            </h2>
            <p className="text-sm text-[var(--muted-foreground)] mt-2">
              Sign in to your organization
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@company.com"
                required
              />
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
              {error && (
                <p className="text-sm text-red-500 bg-red-500/5 rounded-xl px-4 py-2.5 border border-red-500/20">
                  {error}
                </p>
              )}
              <Button type="submit" loading={loading} className="w-full" icon={<ArrowRight className="w-4 h-4" />}>
                Sign in
              </Button>
            </form>

            <div className="mt-6 text-center space-y-3">
              <Link
                to="/forgot-password"
                className="text-sm text-[var(--muted-foreground)] hover:text-[var(--accent)] transition-colors"
              >
                Forgot password?
              </Link>
              <p className="text-sm text-[var(--muted-foreground)]">
                Don't have an account?{' '}
                <Link
                  to="/signup"
                  className="text-[var(--accent)] hover:text-[var(--accent-secondary)] font-medium transition-colors"
                >
                  Create organization
                </Link>
              </p>
            </div>
          </div>

          <p className="text-center text-xs text-[var(--muted-foreground)]/60 mt-6">
            Airlock Governance v0.1.0 &middot; Enterprise
          </p>
        </motion.div>
      </div>
    </div>
  )
}

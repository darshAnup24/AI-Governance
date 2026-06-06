import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button, Input, governanceApi } from '@airlock/shared-ui'
import { Shield, ArrowLeft, Mail } from 'lucide-react'

const easeOut = [0.16, 1, 0.3, 1] as const

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await governanceApi.post('/auth/forgot-password', { email })
      setSent(true)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send reset email')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: easeOut }}
          className="w-full max-w-sm text-center"
        >
          <div className="w-16 h-16 rounded-2xl gradient-icon-bg flex items-center justify-center mx-auto mb-6 shadow-[0_4px_14px_rgba(0,82,255,0.25)]">
            <Mail className="w-7 h-7 text-white" />
          </div>
          <h1
            style={{ fontFamily: 'var(--font-display)' }}
            className="text-3xl text-[var(--foreground)] leading-tight mb-3"
          >
            Check Your Email
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mb-8 max-w-xs mx-auto">
            If an account exists for {email}, we've sent password reset instructions.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)] hover:text-[var(--accent-secondary)] font-medium transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
          </Link>
        </motion.div>
      </div>
    )
  }

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
            Reset Password
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-2">
            Enter your email to receive reset instructions
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
            {error && (
              <p className="text-sm text-red-500 bg-red-500/5 rounded-xl px-4 py-2.5 border border-red-500/20">
                {error}
              </p>
            )}
            <Button type="submit" loading={loading} className="w-full">
              Send Reset Link
            </Button>
          </form>

          <p className="text-center text-sm mt-6">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-[var(--muted-foreground)] hover:text-[var(--accent)] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}

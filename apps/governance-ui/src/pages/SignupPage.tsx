import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext'
import { Button, Input } from '@airlock/shared-ui'
import { Shield, ArrowRight } from 'lucide-react'

const easeOut = [0.16, 1, 0.3, 1] as const

export default function SignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signup, isAuthenticated } = useAuth()
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
      await signup(name, email, password, orgName)
      navigate('/governance')
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Signup failed')
    } finally {
      setLoading(false)
    }
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
            Create Organization
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-2">
            Set up your enterprise AI governance
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Your Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
              required
            />
            <Input
              label="Work Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
            />
            <Input
              label="Organization Name"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Acme Corp"
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
            />
            {error && (
              <p className="text-sm text-red-500 bg-red-500/5 rounded-xl px-4 py-2.5 border border-red-500/20">
                {error}
              </p>
            )}
            <Button type="submit" loading={loading} className="w-full" icon={<ArrowRight className="w-4 h-4" />}>
              Create Organization
            </Button>
          </form>

          <p className="text-center text-sm text-[var(--muted-foreground)] mt-6">
            Already have an account?{' '}
            <Link
              to="/login"
              className="text-[var(--accent)] hover:text-[var(--accent-secondary)] font-medium transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}

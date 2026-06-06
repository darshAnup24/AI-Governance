import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, Shield } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'

type Mode = 'login' | 'signup'

const initialForm = {
  name: '',
  orgName: '',
  email: 'admin@acme.com',
  password: 'Airlock123!',
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, signup } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(initialForm)

  const headline = useMemo(
    () =>
      mode === 'login'
        ? {
            eyebrow: 'Secure access',
            title: 'Sign in to Airlock',
            body: 'Access governance operations, investigate incidents, and manage AI controls from one shared workspace.',
          }
        : {
            eyebrow: 'Organization setup',
            title: 'Create your workspace',
            body: 'Create an organization, activate your first workspace, and bring your team into the governance flow.',
          },
    [mode],
  )

  const updateField =
    (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((current) => ({ ...current, [field]: event.target.value }))
    }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (mode === 'login') {
        await login(form.email, form.password)
      } else {
        await signup({
          name: form.name,
          email: form.email,
          password: form.password,
          orgName: form.orgName,
        })
      }
      navigate('/governance', { replace: true })
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto grid min-h-screen max-w-6xl gap-0 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="hidden border-r border-[var(--border)] bg-[var(--muted)]/40 px-10 py-12 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)]">
              <Shield className="h-3.5 w-3.5 text-[var(--foreground)]" />
              Enterprise governance
            </div>

            <div className="mt-10 max-w-md">
              <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">
                Govern AI with clarity and control.
              </h1>
              <p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">
                Monitor requests, enforce policy, and coordinate remediation through a single operational surface built for enterprise teams.
              </p>
            </div>

            <div className="mt-10 grid gap-4">
              {[
                ['Policy enforcement', 'Evaluate prompts, apply controls, and keep audit trails intact.'],
                ['Incident response', 'Track blocked activity and coordinate follow-up from the same workspace.'],
                ['Operational visibility', 'Review queue health, provider posture, and governance status in one place.'],
              ].map(([title, body]) => (
                <div key={title} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-5 shadow-sm">
                  <p className="text-sm font-medium text-[var(--foreground)]">{title}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">Workspace defaults</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {[
                ['Live policies', '18'],
                ['Open incidents', '4'],
                ['Protected models', '22'],
                ['Audit streams', '5'],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-2xl font-semibold text-[var(--foreground)]">{value}</p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-4 py-10 sm:px-6 lg:px-10">
          <div className="w-full max-w-md">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm sm:p-8">
              <div className="mb-6">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  {headline.eyebrow}
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--foreground)]">
                  {headline.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{headline.body}</p>
              </div>

              <div className="mb-6 inline-flex w-full rounded-lg border border-[var(--border)] bg-[var(--muted)] p-1">
                {(['login', 'signup'] as Mode[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setMode(value)
                      setError('')
                    }}
                    className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      mode === value
                        ? 'bg-[var(--background)] text-[var(--foreground)] shadow-sm'
                        : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    {value === 'login' ? 'Sign in' : 'Sign up'}
                  </button>
                ))}
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
                {mode === 'signup' ? (
                  <>
                    <Input
                      label="Full Name"
                      name="name"
                      value={form.name}
                      onChange={updateField('name')}
                      placeholder="Avery Johnson"
                      required
                    />
                    <Input
                      label="Organization"
                      name="orgName"
                      value={form.orgName}
                      onChange={updateField('orgName')}
                      placeholder="Acme Corp"
                      required
                    />
                  </>
                ) : null}

                <Input
                  label="Email"
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={updateField('email')}
                  placeholder="admin@company.com"
                  required
                />

                <div className="space-y-1.5">
                  <span className="block text-sm font-medium text-[var(--foreground)]">Password</span>
                  <div className="relative">
                    <input
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={updateField('password')}
                      placeholder="Enter your password"
                      className="input pr-12"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {error ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                    {error}
                  </div>
                ) : null}

                <Button type="submit" className="w-full justify-center" loading={loading} icon={!loading ? <ArrowRight className="h-4 w-4" /> : undefined}>
                  {mode === 'login' ? 'Sign in' : 'Create workspace'}
                </Button>
              </form>

              <p className="mt-6 text-xs leading-5 text-[var(--muted-foreground)]">
                By continuing, you agree to your organization&apos;s governance and access policies.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

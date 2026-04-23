import { useState } from 'react'
import { Shield, LogIn } from 'lucide-react'
import govApi from '../lib/govApi'

export default function Login() {
    const [mode, setMode] = useState<'login' | 'register'>('login')
    const [email, setEmail] = useState('admin@acme.com')
    const [password, setPassword] = useState('ShieldAI123!')
    const [orgName, setOrgName] = useState('Acme Corp')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true); setError('')
        try {
            const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
            const body: any = { email, password }
            if (mode === 'register') body.orgName = orgName
            const r = await govApi.post(endpoint, body)
            localStorage.setItem('shieldai_token', r.data.accessToken)
            localStorage.setItem('shieldai_user', JSON.stringify(r.data.user))
            window.location.href = '/governance'
        } catch (err: any) {
            setError(err.response?.data?.error || 'Connection failed — ensure governance service is running')
        }
        setLoading(false)
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500/10 mb-4">
                        <Shield className="w-8 h-8 text-brand-400" />
                    </div>
                    <h1 className="text-3xl font-bold text-slate-100">ShieldAI</h1>
                    <p className="text-slate-500 mt-1">AI Governance Platform</p>
                </div>

                <div className="card">
                    <div className="flex mb-6 bg-slate-800 rounded-lg p-1">
                        <button onClick={() => setMode('login')} className={`flex-1 py-2 rounded-md text-sm transition-colors ${mode === 'login' ? 'bg-brand-500 text-white' : 'text-slate-400'}`}>Login</button>
                        <button onClick={() => setMode('register')} className={`flex-1 py-2 rounded-md text-sm transition-colors ${mode === 'register' ? 'bg-brand-500 text-white' : 'text-slate-400'}`}>Register</button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {mode === 'register' && (
                            <input className="input w-full" placeholder="Organization Name" value={orgName} onChange={e => setOrgName(e.target.value)} />
                        )}
                        <input className="input w-full" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
                        <input className="input w-full" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
                        {error && <p className="text-xs text-red-400">{error}</p>}
                        <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <LogIn className="w-4 h-4" />}
                            {mode === 'login' ? 'Sign In' : 'Create Account'}
                        </button>
                    </form>

                    {mode === 'login' && (
                        <p className="text-xs text-slate-600 mt-4 text-center">
                            Demo: admin@acme.com / ShieldAI123!
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}

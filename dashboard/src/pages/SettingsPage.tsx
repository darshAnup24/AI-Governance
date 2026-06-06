import { useEffect, useState } from 'react'
import { Activity, KeyRound, Save, Settings, ShieldAlert, ShieldCheck, Users, Webhook } from 'lucide-react'

import govApi from '../lib/govApi'
import api from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { PageHeader, PageShell, StatusPill } from '../components/ui/page-shell'

export default function SettingsPage() {
    const { user } = useAuth()
    const [profile, setProfile] = useState<any>(null)
    const [sso, setSso] = useState<any>(null)
    const [runtime, setRuntime] = useState<any>(null)
    const [proxyRuntime, setProxyRuntime] = useState<any>(null)
    const [queueHealth, setQueueHealth] = useState<any>(null)
    const [redisHealth, setRedisHealth] = useState<any>(null)
    const [invitations, setInvitations] = useState<any[]>([])
    const [sessions, setSessions] = useState<any[]>([])
    const [onboarding, setOnboarding] = useState<any>(null)

    useEffect(() => {
        void Promise.all([
            govApi.get('/api/settings/profile').then((response) => setProfile(response.data)).catch(() => undefined),
            govApi.get('/api/settings/sso').then((response) => setSso(response.data)).catch(() => undefined),
            govApi.get('/api/settings/runtime').then((response) => setRuntime(response.data)).catch(() => undefined),
            govApi.get('/api/invitations').then((response) => setInvitations(response.data ?? [])).catch(() => undefined),
            govApi.get('/api/auth/sessions').then((response) => setSessions(response.data ?? [])).catch(() => undefined),
            govApi.get('/api/organization/onboarding').then((response) => setOnboarding(response.data)).catch(() => undefined),
            api.get('/api/v1/runtime-mode').then((response) => setProxyRuntime(response.data)).catch(() => undefined),
            api.get('/api/v1/analytics/queue-depth').then((response) => setQueueHealth(response.data)).catch(() => undefined),
            api.get('/api/v1/analytics/redis-health').then((response) => setRedisHealth(response.data)).catch(() => undefined),
        ]).catch(() => undefined)
    }, [])

    return (
        <PageShell>
            <PageHeader
                badge="Enterprise Settings"
                title="Organization, runtime, and operational controls"
                description="Manage identity, degraded-mode behavior, onboarding, and integrations from one consistent configuration surface."
                status={<StatusPill label={proxyRuntime?.mode ? `Runtime ${proxyRuntime.mode}` : 'Runtime Pending'} tone="default" />}
            />

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="card space-y-4">
                    <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
                        <Settings className="w-5 h-5 text-[var(--accent)]" />
                        Organization Profile
                    </h2>
                    <div>
                        <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Organization Name</label>
                        <input className="input w-full" defaultValue={profile?.name || user?.organization?.name || ''} placeholder="Your Company" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Industry</label>
                        <input className="input w-full" defaultValue={profile?.industry || ''} placeholder="Finance, Healthcare, Technology..." />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Primary Domain</label>
                        <input className="input w-full" defaultValue={profile?.domain || ''} placeholder="company.com" />
                    </div>
                    <button className="btn-primary flex items-center gap-2">
                        <Save className="w-4 h-4" /> Save Changes
                    </button>
                </div>

                <div className="card space-y-4">
                    <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-[var(--accent)]" />
                        SSO & Tenant Security
                    </h2>
                    <div className="rounded-2xl border border-[var(--border)] p-4">
                        <p className="text-sm font-medium text-[var(--foreground)]">{sso?.provider || 'OIDC / SAML not configured yet'}</p>
                        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                            {sso?.isActive ? 'SSO is active for this organization.' : 'SSO is disabled but the tenant is ready for IdP setup.'}
                        </p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] p-4">
                        <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Onboarding Progress</p>
                        <p className="mt-2 text-3xl font-semibold text-[var(--foreground)]">{onboarding?.percentage ?? 0}%</p>
                        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                            {onboarding?.completedSteps ?? 0} of {onboarding?.totalSteps ?? 0} enterprise setup steps completed.
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="card space-y-4">
                    <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-[var(--accent)]" />
                        Runtime Security Mode
                    </h2>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        {['STRICT', 'STANDARD', 'HYBRID'].map((mode) => (
                            <button
                                key={mode}
                                onClick={() => setRuntime((current: any) => ({ ...(current || {}), mode }))}
                                className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                                    runtime?.mode === mode
                                        ? 'border-[var(--accent)] bg-[var(--accent)]/8'
                                        : 'border-[var(--border)] bg-white'
                                }`}
                            >
                                <p className="font-medium text-[var(--foreground)]">{mode}</p>
                                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                                    {mode === 'STRICT'
                                        ? 'Fail closed on detection outages.'
                                        : mode === 'HYBRID'
                                            ? 'Fail closed only for sensitive workflows.'
                                            : 'Preserve availability and log degradation.'}
                                </p>
                            </button>
                        ))}
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] p-4">
                        <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Proxy Runtime</p>
                        <div className="mt-2 flex flex-wrap gap-4 text-sm">
                            <span className="text-[var(--foreground)]">Active mode: <strong>{proxyRuntime?.mode || runtime?.mode || 'STANDARD'}</strong></span>
                            <span className="text-[var(--foreground)]">Degraded events: <strong>{proxyRuntime?.degraded_events ?? 0}</strong></span>
                            <span className="text-[var(--foreground)]">Last reason: <strong>{proxyRuntime?.last_degraded_reason || 'none'}</strong></span>
                        </div>
                    </div>
                    <button
                        className="btn-primary flex items-center gap-2"
                        onClick={() => {
                            void govApi.put('/api/settings/runtime', runtime).then((response) => setRuntime(response.data))
                        }}
                    >
                        <Save className="w-4 h-4" /> Save Runtime Controls
                    </button>
                </div>

                <div className="card space-y-4">
                    <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
                        <Activity className="w-5 h-5 text-[var(--accent)]" />
                        Operational Health
                    </h2>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-[var(--border)] p-4">
                            <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Queue Health</p>
                            <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{queueHealth?.audit_queue ?? 0}</p>
                            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                                DLQ {queueHealth?.dead_letter_queue ?? 0} · Lag {queueHealth?.consumer_lag ?? 0}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-[var(--border)] p-4">
                            <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Redis Health</p>
                            <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                                {redisHealth?.connected ? 'Healthy' : 'Degraded'}
                            </p>
                            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                                Cache hit rate {redisHealth?.hit_rate ?? 0}% · Uptime {redisHealth?.uptime_seconds ?? 0}s
                            </p>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] p-4">
                        <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Webhook / SIEM Integrations</p>
                        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                            Store outbound operational integrations in runtime settings so degraded-mode, replay, and incident alerts route consistently.
                        </p>
                        <div className="mt-3 flex items-center gap-2 text-sm text-[var(--foreground)]">
                            <Webhook className="h-4 w-4 text-[var(--accent)]" />
                            {runtime?.webhookTargets?.length ?? 0} webhook targets · {runtime?.siemTargets?.length ?? 0} SIEM targets
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="card space-y-4">
                    <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
                        <Users className="w-5 h-5 text-[var(--accent)]" />
                        Team Invitations
                    </h2>
                    <div className="space-y-3">
                        {invitations.length ? invitations.slice(0, 6).map((invitation) => (
                            <div key={invitation.id} className="flex items-center justify-between rounded-2xl border border-[var(--border)] p-4">
                                <div>
                                    <p className="text-sm font-medium text-[var(--foreground)]">{invitation.email}</p>
                                    <p className="text-xs text-[var(--muted-foreground)]">{invitation.role} · {invitation.status}</p>
                                </div>
                                <span className="badge-yellow">{invitation.status}</span>
                            </div>
                        )) : (
                            <p className="text-sm text-[var(--muted-foreground)]">No outstanding invitations.</p>
                        )}
                    </div>
                </div>

                <div className="card space-y-4">
                    <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
                        <KeyRound className="w-5 h-5 text-[var(--accent)]" />
                        Active Sessions
                    </h2>
                    <div className="space-y-3">
                        {sessions.length ? sessions.slice(0, 6).map((session) => (
                            <div key={session.id} className="rounded-2xl border border-[var(--border)] p-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <p className="text-sm font-medium text-[var(--foreground)]">{session.deviceName || 'Browser Session'}</p>
                                        <p className="text-xs text-[var(--muted-foreground)]">{session.ipAddress || 'Unknown IP'}</p>
                                    </div>
                                    <span className={session.status === 'ACTIVE' ? 'badge-green' : 'badge-yellow'}>{session.status}</span>
                                </div>
                                <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                                    Last active {new Date(session.lastActiveAt).toLocaleString()}
                                </p>
                            </div>
                        )) : (
                            <p className="text-sm text-[var(--muted-foreground)]">No session data available.</p>
                        )}
                    </div>
                </div>
            </div>
        </PageShell>
    )
}

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card, Button, Input, EmptyState, SectionLabel, fadeInUp, stagger } from '@airlock/shared-ui'
import { useAuth } from '../contexts/AuthContext'
import { Settings as SettingsIcon, User, Shield, Bell, Palette, Key } from 'lucide-react'

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'api', label: 'API Keys', icon: Key },
]

export default function Settings() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('profile')
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-8 max-w-4xl">
      <motion.div variants={fadeInUp}>
        <SectionLabel>Configuration</SectionLabel>
        <h1 style={{ fontFamily: 'var(--font-display)' }} className="text-3xl text-[var(--foreground)] leading-tight mt-4">
          Settings
        </h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-2">Manage your account and organization preferences</p>
      </motion.div>

      <motion.div variants={fadeInUp} className="flex gap-1 border-b border-[var(--border)]">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all duration-200 ${
                activeTab === tab.id
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </motion.div>

      <motion.div variants={fadeInUp} key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {activeTab === 'profile' && (
          <div className="space-y-6">
            <Card title="Profile Information" subtitle="Update your personal details">
              <div className="space-y-5">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] flex items-center justify-center text-2xl font-bold text-white shadow-[0_4px_14px_rgba(0,82,255,0.25)]">
                    {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">{user?.name}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">{user?.email}</p>
                    <p className="text-xs text-[var(--muted-foreground)]/70 mt-0.5">{user?.role?.replace('_', ' ')}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Input label="Full Name" defaultValue={user?.name} placeholder="Your name" />
                  <Input label="Email" type="email" defaultValue={user?.email} placeholder="you@company.com" />
                  <Input label="Job Title" defaultValue={user?.title || ''} placeholder="e.g. AI Security Engineer" />
                  <Input label="Organization" defaultValue={user?.organization?.name || ''} placeholder="Organization name" disabled />
                </div>
              </div>
            </Card>
            <div className="flex justify-end">
              <Button onClick={handleSave}>{saved ? 'Saved!' : 'Save Changes'}</Button>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="space-y-6">
            <Card title="Password" subtitle="Update your account password">
              <div className="space-y-5">
                <Input label="Current Password" type="password" placeholder="Enter current password" />
                <Input label="New Password" type="password" placeholder="At least 8 characters" />
                <Input label="Confirm Password" type="password" placeholder="Confirm new password" />
              </div>
            </Card>
            <Card title="Multi-Factor Authentication" subtitle="Add an extra layer of security">
              <p className="text-sm text-[var(--muted-foreground)] mb-4">
                {user?.mfaEnabled
                  ? 'MFA is currently enabled for your account.'
                  : 'Enable two-factor authentication to secure your account.'}
              </p>
              <Button variant={user?.mfaEnabled ? 'outline' : 'primary'}>
                {user?.mfaEnabled ? 'Disable MFA' : 'Enable MFA'}
              </Button>
            </Card>
          </div>
        )}

        {activeTab === 'notifications' && (
          <Card title="Notification Preferences" subtitle="Choose what you want to be notified about">
            <div className="space-y-4">
              {[
                { label: 'Security Alerts', desc: 'Critical incidents and policy violations' },
                { label: 'Compliance Updates', desc: 'Framework status changes and scan results' },
                { label: 'Weekly Reports', desc: 'Weekly governance summary digest' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between py-3 border-b border-[var(--border)] last:border-0">
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">{item.label}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">{item.desc}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" defaultChecked className="sr-only peer" />
                    <div className="w-10 h-6 bg-[var(--muted)] rounded-full peer peer-checked:bg-gradient-to-r peer-checked:from-[var(--accent)] peer-checked:to-[var(--accent-secondary)] transition-all duration-200" />
                    <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full peer-checked:translate-x-full transition-transform duration-200" />
                  </label>
                </div>
              ))}
            </div>
          </Card>
        )}

        {activeTab === 'api' && (
          <Card title="API Keys" subtitle="Manage your API access tokens">
            <EmptyState
              icon={<Key className="w-8 h-8" />}
              title="No API keys generated"
              description="API keys allow programmatic access to the governance API for integrations and automation."
              action={<Button>Generate API Key</Button>}
            />
          </Card>
        )}
      </motion.div>
    </motion.div>
  )
}

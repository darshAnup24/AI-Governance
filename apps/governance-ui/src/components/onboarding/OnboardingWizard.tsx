import { useState } from 'react'
import { AirlockButton, AirlockInput, AirlockModal, AirlockSelect } from '@airlock/shared-ui'
import { Shield, Building2, Users, Link, CheckCircle2, PartyPopper } from 'lucide-react'
import { governanceApi } from '@airlock/shared-ui'
import { useAuth } from '../../contexts/AuthContext'

const steps = [
  { title: 'Welcome', icon: Shield },
  { title: 'Organization', icon: Building2 },
  { title: 'Workspace', icon: Building2 },
  { title: 'Provider', icon: Link },
  { title: 'Policies', icon: Shield },
  { title: 'Compliance', icon: CheckCircle2 },
  { title: 'Team', icon: Users },
  { title: 'Done', icon: PartyPopper },
]

const INDUSTRIES = [
  { value: 'TECHNOLOGY', label: 'Technology' },
  { value: 'HEALTHCARE', label: 'Healthcare' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'GOVERNMENT', label: 'Government' },
  { value: 'RETAIL', label: 'Retail' },
  { value: 'EDUCATION', label: 'Education' },
  { value: 'MANUFACTURING', label: 'Manufacturing' },
  { value: 'OTHER', label: 'Other' },
]

const COMPANY_SIZES = [
  { value: 'STARTUP', label: '1-10 employees' },
  { value: 'SMALL', label: '11-50 employees' },
  { value: 'MEDIUM', label: '51-200 employees' },
  { value: 'LARGE', label: '201-1000 employees' },
  { value: 'ENTERPRISE', label: '1000+ employees' },
]

const PROVIDER_TYPES = [
  { value: 'OPENAI', label: 'OpenAI' },
  { value: 'ANTHROPIC', label: 'Anthropic' },
  { value: 'AZURE_OPENAI', label: 'Azure OpenAI' },
  { value: 'GOOGLE', label: 'Google Gemini' },
  { value: 'OLLAMA', label: 'Ollama (Local)' },
]

const POLICY_TEMPLATES = [
  { id: 'data-protection', name: 'Data Protection', description: 'Prevent sensitive data leakage to AI models', category: 'DATA_PROTECTION' },
  { id: 'content-filtering', name: 'Content Filtering', description: 'Filter harmful or inappropriate AI outputs', category: 'CONTENT_MODERATION' },
  { id: 'compliance-gdpr', name: 'GDPR Compliance', description: 'EU data protection regulation compliance', category: 'COMPLIANCE' },
  { id: 'compliance-hipaa', name: 'HIPAA Compliance', description: 'Healthcare data protection compliance', category: 'COMPLIANCE' },
  { id: 'compliance-soc2', name: 'SOC 2 Compliance', description: 'Service organization control compliance', category: 'COMPLIANCE' },
  { id: 'prompt-injection', name: 'Prompt Injection Protection', description: 'Detect and block prompt injection attacks', category: 'SECURITY' },
]

const COMPLIANCE_FRAMEWORKS = [
  { value: 'GDPR', label: 'GDPR' },
  { value: 'HIPAA', label: 'HIPAA' },
  { value: 'SOC2', label: 'SOC 2' },
  { value: 'PCI_DSS', label: 'PCI DSS' },
  { value: 'ISO27001', label: 'ISO 27001' },
  { value: 'NIST_AI_RMF', label: 'NIST AI RMF' },
  { value: 'EU_AI_ACT', label: 'EU AI Act' },
]

interface OnboardingWizardProps {
  open: boolean
  onClose: () => void
}

export default function OnboardingWizard({ open, onClose }: OnboardingWizardProps) {
  const { user, refreshAuth } = useAuth()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 2: Org Profile
  const [orgName, setOrgName] = useState(user?.organization?.name || '')
  const [industry, setIndustry] = useState(user?.organization?.industry || 'TECHNOLOGY')
  const [companySize, setCompanySize] = useState('STARTUP')

  // Step 3: Workspace
  const [workspaceName, setWorkspaceName] = useState('Production')
  const [workspaceType, setWorkspaceType] = useState('PRODUCTION')

  // Step 4: Provider
  const [providerType, setProviderType] = useState('OPENAI')
  const [providerKey, setProviderKey] = useState('')

  // Step 5: Policies
  const [selectedPolicies, setSelectedPolicies] = useState<string[]>(['data-protection', 'prompt-injection'])

  // Step 6: Compliance
  const [selectedFrameworks, setSelectedFrameworks] = useState<string[]>([])

  // Step 7: Team
  const [inviteEmails, setInviteEmails] = useState('')

  const canNext = () => {
    if (step === 1 && !orgName.trim()) return false
    if (step === 2 && !workspaceName.trim()) return false
    return true
  }

  const handleNext = async () => {
    if (step === steps.length - 1) { onClose(); return }

    setLoading(true)
    setError(null)

    try {
      // Step 2: Save org profile
      if (step === 1) {
        await governanceApi.put('/api/settings/profile', { name: orgName, industry, companySize })
      }

      // Step 3: Create workspace
      if (step === 2) {
        await governanceApi.post('/api/organization/workspaces', { name: workspaceName, type: workspaceType })
      }

      // Step 4: Connect provider
      if (step === 3 && providerKey.trim()) {
        await governanceApi.post('/api/providers', { name: `${providerType} Provider`, type: providerType, apiKeyEncrypted: providerKey })
      }

      // Step 5: Create policies from templates
      if (step === 4 && selectedPolicies.length > 0) {
        const policiesToCreate = POLICY_TEMPLATES
          .filter(t => selectedPolicies.includes(t.id))
          .map(t => ({ name: t.name, description: t.description, category: t.category, action: 'LOG', severity: 'MEDIUM', conditions: {} }))
        await governanceApi.post('/api/policies/bulk', { policies: policiesToCreate })
      }

      // Step 6: Enable compliance frameworks
      if (step === 5 && selectedFrameworks.length > 0) {
        await governanceApi.put('/api/settings/compliance', { frameworks: selectedFrameworks })
      }

      // Step 7: Send invitations
      if (step === 6 && inviteEmails.trim()) {
        const emails = inviteEmails.split(',').map(e => e.trim()).filter(e => e.includes('@'))
        if (emails.length > 0) {
          const invitations = emails.map(email => ({ email, role: 'VIEWER' }))
          await governanceApi.post('/api/invitations/bulk', { invitations })
        }
      }

      // Refresh user data after changes
      if (step === 1 || step === 2) {
        await refreshAuth()
      }

      setStep(step + 1)
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const togglePolicy = (id: string) => {
    setSelectedPolicies(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  const toggleFramework = (fw: string) => {
    setSelectedFrameworks(prev => prev.includes(fw) ? prev.filter(f => f !== fw) : [...prev, fw])
  }

  return (
    <AirlockModal open={open} onClose={onClose} title="Set Up Your Organization">
      <div className="space-y-8">
        {/* Progress Bar */}
        <div className="flex items-center justify-between px-1">
          {steps.map((s, i) => (
            <div key={s.title} className="flex items-center">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                i <= step ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-500'
              }`}>
                <s.icon className="w-4 h-4" />
              </div>
              {i < steps.length - 1 && (
                <div className={`w-8 h-0.5 mx-1 transition-colors ${i < step ? 'bg-indigo-600' : 'bg-gray-800'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Step Content */}
        <div className="min-h-[240px]">
          {step === 0 && (
            <div className="text-center py-6">
              <Shield className="w-16 h-16 text-indigo-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-100 mb-2">Welcome to Airlock</h2>
              <p className="text-sm text-gray-500">Let's get your organization set up in just a few steps. You'll have AI governance running in minutes.</p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4 py-4">
              <AirlockInput label="Organization Name" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="e.g. Acme Corp" />
              <AirlockSelect label="Industry" value={industry} onChange={(e) => setIndustry(e.target.value)} options={INDUSTRIES} />
              <AirlockSelect label="Company Size" value={companySize} onChange={(e) => setCompanySize(e.target.value)} options={COMPANY_SIZES} />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 py-4">
              <AirlockInput label="Workspace Name" value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="e.g. Production" />
              <AirlockSelect label="Workspace Type" value={workspaceType} onChange={(e) => setWorkspaceType(e.target.value)} options={[
                { value: 'PRODUCTION', label: 'Production' },
                { value: 'STAGING', label: 'Staging' },
                { value: 'DEVELOPMENT', label: 'Development' },
                { value: 'SANDBOX', label: 'Sandbox' },
                { value: 'LAB', label: 'Lab' },
              ]} />
              <p className="text-xs text-gray-500">Default environments (Production, Staging, Development) will be created automatically.</p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 py-4">
              <AirlockSelect label="AI Provider" value={providerType} onChange={(e) => setProviderType(e.target.value)} options={PROVIDER_TYPES} />
              <AirlockInput label="API Key (optional)" type="password" value={providerKey} onChange={(e) => setProviderKey(e.target.value)} placeholder="sk-..." />
              <p className="text-xs text-gray-500">Connect your AI provider to enable governance monitoring. You can skip and do this later.</p>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3 py-4">
              <p className="text-sm text-gray-400 mb-3">Select policy templates to enable:</p>
              {POLICY_TEMPLATES.map(t => (
                <label key={t.id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedPolicies.includes(t.id) ? 'border-indigo-500 bg-indigo-900/10' : 'border-gray-800 hover:border-gray-700'
                }`}>
                  <input type="checkbox" checked={selectedPolicies.includes(t.id)} onChange={() => togglePolicy(t.id)} className="mt-1 rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500" />
                  <div>
                    <div className="text-sm font-medium text-gray-200">{t.name}</div>
                    <div className="text-xs text-gray-500">{t.description}</div>
                  </div>
                </label>
              ))}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3 py-4">
              <p className="text-sm text-gray-400 mb-3">Select compliance frameworks:</p>
              {COMPLIANCE_FRAMEWORKS.map(fw => (
                <label key={fw.value} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedFrameworks.includes(fw.value) ? 'border-indigo-500 bg-indigo-900/10' : 'border-gray-800 hover:border-gray-700'
                }`}>
                  <input type="checkbox" checked={selectedFrameworks.includes(fw.value)} onChange={() => toggleFramework(fw.value)} className="rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500" />
                  <span className="text-sm text-gray-200">{fw.label}</span>
                </label>
              ))}
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4 py-4">
              <p className="text-sm text-gray-400 mb-3">Invite team members (comma-separated emails):</p>
              <textarea
                value={inviteEmails}
                onChange={(e) => setInviteEmails(e.target.value)}
                placeholder="alice@acme.com, bob@acme.com, carol@acme.com"
                className="w-full h-24 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-500">Invited users will receive a default Viewer role. You can adjust permissions later.</p>
            </div>
          )}

          {step === 7 && (
            <div className="text-center py-6">
              <PartyPopper className="w-16 h-16 text-indigo-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-100 mb-2">You're All Set!</h2>
              <p className="text-sm text-gray-500">Your organization has been configured. Start exploring the governance dashboard to monitor your AI estate.</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-800">
          <button
            onClick={() => setStep(Math.max(0, step - 1))}
            className={`text-sm text-gray-500 hover:text-gray-300 transition-colors ${step === 0 ? 'invisible' : ''}`}
          >
            Back
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-600">{step + 1} / {steps.length}</span>
            <AirlockButton onClick={handleNext} disabled={!canNext() || loading}>
              {loading ? 'Saving...' : step === steps.length - 1 ? 'Get Started' : 'Continue'}
            </AirlockButton>
          </div>
        </div>
      </div>
    </AirlockModal>
  )
}

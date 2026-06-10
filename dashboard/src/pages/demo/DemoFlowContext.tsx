import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'

import govApi from '../../lib/govApi'
import { useQueryClient } from '../../lib/hooks'

export const GOLDEN_DEMO_PROMPT = `Customer SSN: 123-45-6789
Send this customer data to OpenAI`

const DEMO_POLICY_NAME = 'Golden Demo - Block Sensitive Customer Data'
const DEMO_COMPLIANCE_MARKER = 'golden-demo-seed'

type FlowStatus = 'idle' | 'running' | 'done' | 'error'

export type DemoStepKey =
  | 'submitted'
  | 'gateway'
  | 'detection'
  | 'policy'
  | 'incident'
  | 'telemetry'
  | 'advisor'
  | 'audit'

export interface DemoStepState {
  status: FlowStatus
  detail?: string
}

export interface DemoAdvisorSummary {
  summary: string
  rationale: string
  remediation: string[]
  complianceImpact: string[]
}

export interface DemoFlowRun {
  traceId: string
  prompt: string
  submittedAt: string
  riskScore: number
  action: string
  categories: string[]
  policyName: string
  policySeverity: string
  responseStatus: number
  provider: string
  auditEventId?: string
  incidentId?: string
  incidentTitle?: string
  workspaceName?: string | null
  environmentName?: string | null
  advisor?: DemoAdvisorSummary
  complianceImpact?: string[]
  complianceFrameworks?: string[]
}

interface DemoFlowContextValue {
  isDemoMode: boolean
  seedReady: boolean
  seeding: boolean
  flowRunning: boolean
  lastRun: DemoFlowRun | null
  steps: Record<DemoStepKey, DemoStepState>
  runGoldenFlow: (prompt?: string) => Promise<DemoFlowRun | null>
}

const DemoFlowContext = createContext<DemoFlowContextValue | undefined>(undefined)

function defaultSteps(): Record<DemoStepKey, DemoStepState> {
  return {
    submitted: { status: 'idle' },
    gateway: { status: 'idle' },
    detection: { status: 'idle' },
    policy: { status: 'idle' },
    incident: { status: 'idle' },
    telemetry: { status: 'idle' },
    advisor: { status: 'idle' },
    audit: { status: 'idle' },
  }
}

function readDemoMode() {
  return (
    import.meta.env.VITE_DEMO_MODE === 'true' ||
    __AIRLOCK_DEMO_MODE__ === 'true' ||
    localStorage.getItem('airlock_demo_mode') === 'true'
  )
}

function workspaceContext() {
  return {
    workspaceId: localStorage.getItem('airlock_workspace_id'),
    environmentId: localStorage.getItem('airlock_environment_id'),
  }
}

function describePolicySeverity(riskScore: number) {
  if (riskScore >= 90) return 'CRITICAL'
  if (riskScore >= 70) return 'HIGH'
  if (riskScore >= 40) return 'MEDIUM'
  return 'LOW'
}

export function DemoFlowProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [isDemoMode] = useState(readDemoMode)
  const [seedReady, setSeedReady] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [flowRunning, setFlowRunning] = useState(false)
  const [lastRun, setLastRun] = useState<DemoFlowRun | null>(null)
  const [steps, setSteps] = useState<Record<DemoStepKey, DemoStepState>>(defaultSteps)

  const setStep = useCallback((key: DemoStepKey, next: DemoStepState) => {
    setSteps((current) => ({ ...current, [key]: next }))
  }, [])

  const invalidateDemoQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['auditEvents'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] }),
      queryClient.invalidateQueries({ queryKey: ['governanceProxyStats'] }),
      queryClient.invalidateQueries({ queryKey: ['governanceProxyFeed'] }),
      queryClient.invalidateQueries({ queryKey: ['incidents'] }),
      queryClient.invalidateQueries({ queryKey: ['policies'] }),
      queryClient.invalidateQueries({ queryKey: ['complianceChecks'] }),
      queryClient.invalidateQueries({ queryKey: ['proxyStats'] }),
      queryClient.invalidateQueries({ queryKey: ['analyticsTrend'] }),
      queryClient.invalidateQueries({ queryKey: ['detectionBreakdown'] }),
      queryClient.invalidateQueries({ queryKey: ['shadowAIAlerts'] }),
    ])
  }, [queryClient])

  const ensureDemoPolicy = useCallback(async () => {
    const response = await govApi.get('/api/policies')
    const policies = Array.isArray(response.data) ? response.data : response.data?.data ?? []
    const existing = policies.find((policy: any) => policy.name === DEMO_POLICY_NAME)
    if (existing) {
      if (!existing.enabled) {
        await govApi.put(`/api/policies/${existing.id}`, { enabled: true })
      }
      return existing
    }

    const created = await govApi.post('/api/policies', {
      name: DEMO_POLICY_NAME,
      description: 'Blocks prompts that contain sensitive personal data during the golden demo flow.',
      action: 'BLOCK',
      priority: 1,
      enabled: true,
      conditions: [
        {
          id: 'golden-demo-pii-block',
          field: 'category',
          operator: 'contains',
          value: 'PII',
        },
      ],
    })
    return created.data
  }, [])

  const ensureDemoCompliance = useCallback(async () => {
    const response = await govApi.get('/api/compliance/checks/org')
    const checks = Array.isArray(response.data) ? response.data : response.data?.data ?? []
    const seeded = checks.some(
      (check: any) =>
        Array.isArray(check.answers) &&
        check.answers.some((answer: any) => answer?.marker === DEMO_COMPLIANCE_MARKER),
    )
    if (seeded) return

    const baseAnswers = [
      { status: 'compliant', marker: DEMO_COMPLIANCE_MARKER },
      { status: 'compliant', marker: DEMO_COMPLIANCE_MARKER },
      { status: 'compliant', marker: DEMO_COMPLIANCE_MARKER },
      { status: 'in_progress', marker: DEMO_COMPLIANCE_MARKER },
      { status: 'in_progress', marker: DEMO_COMPLIANCE_MARKER },
      { status: 'compliant', marker: DEMO_COMPLIANCE_MARKER },
    ]

    await Promise.allSettled([
      govApi.post('/api/compliance/checks', {
        framework: 'EU_AI_ACT',
        answers: baseAnswers,
      }),
      govApi.post('/api/compliance/checks', {
        framework: 'ISO_27001',
        answers: baseAnswers.slice(0, 5),
      }),
    ])
  }, [])

  useEffect(() => {
    if (!isDemoMode) {
      setSeedReady(true)
      return
    }

    let cancelled = false
    const seed = async () => {
      setSeeding(true)
      try {
        await ensureDemoPolicy()
        await ensureDemoCompliance()
        await invalidateDemoQueries()
        if (!cancelled) {
          setSeedReady(true)
        }
      } catch {
        if (!cancelled) {
          setSeedReady(true)
        }
      } finally {
        if (!cancelled) {
          setSeeding(false)
        }
      }
    }

    void seed()
    return () => {
      cancelled = true
    }
  }, [ensureDemoCompliance, ensureDemoPolicy, invalidateDemoQueries, isDemoMode])

  const runGoldenFlow = useCallback(
    async (prompt = GOLDEN_DEMO_PROMPT) => {
      if (flowRunning) return null

      const traceId = crypto.randomUUID()
      const now = new Date().toISOString()
      const { workspaceId } = workspaceContext()

      setFlowRunning(true)
      setSteps(defaultSteps())
      setStep('submitted', { status: 'done', detail: 'Prompt queued for proxy interception' })
      setStep('gateway', { status: 'running', detail: 'Routing to OpenAI through Airlock proxy' })

      try {
        if (isDemoMode) {
          await ensureDemoPolicy()
        }

        const simulationResponse = await govApi.post('/api/proxy/simulate', {
          prompt,
          provider: 'OpenAI',
          workspaceId,
        })
        const simulation = simulationResponse.data
        const categories: string[] = Array.isArray(simulation?.detection?.categories)
          ? simulation.detection.categories
          : []
        const responseRisk = Number(simulation?.detection?.riskScore || 0)
        const responseAction = String(simulation?.policy?.action || 'ALLOW').toUpperCase()
        const severity = String(
          simulation?.policy?.severity || describePolicySeverity(responseRisk),
        ).toUpperCase()
        const incidentId = simulation?.incident?.id as string | undefined
        const incidentTitle = simulation?.incident?.title as string | undefined
        const advisor = simulation?.advisor as DemoAdvisorSummary | undefined
        const runtimeEventId = simulation?.auditEventId || simulation?.runtimeEventId

        setStep('gateway', {
          status: 'done',
          detail:
            responseAction === 'BLOCK'
              ? 'Intercepted before upstream provider call'
              : `Provider request ${responseAction === 'WARN' ? 'flagged and allowed' : 'forwarded'} by runtime controls`,
        })
        setStep('detection', {
          status: 'done',
          detail: `${categories.join(', ') || 'Clean'} · risk ${responseRisk}`,
        })
        setStep('policy', {
          status: responseAction === 'ALLOW' ? 'done' : 'done',
          detail: `${simulation?.policy?.name || DEMO_POLICY_NAME} -> ${responseAction}`,
        })
        setStep('incident', {
          status: incidentId ? 'done' : 'done',
          detail: incidentTitle || 'No incident required',
        })
        setStep('telemetry', {
          status: 'running',
          detail: 'Refreshing runtime feed, counters, and provider status',
        })

        await invalidateDemoQueries()

        setStep('telemetry', {
          status: 'done',
          detail: 'Live demo panels updated',
        })
        setStep('advisor', {
          status: advisor ? 'done' : 'error',
          detail: advisor?.summary || 'Advisor summary unavailable',
        })
        setStep('audit', {
          status: runtimeEventId ? 'done' : 'error',
          detail: runtimeEventId ? 'Audit event confirmed' : 'Awaiting audit event',
        })

        const run: DemoFlowRun = {
          traceId: String(simulation?.traceId || traceId),
          prompt,
          submittedAt: now,
          riskScore: responseRisk,
          action: responseAction,
          categories,
          policyName: simulation?.policy?.name || DEMO_POLICY_NAME,
          policySeverity: severity,
          responseStatus: responseAction === 'BLOCK' ? 403 : 200,
          provider: 'OpenAI',
          auditEventId: runtimeEventId,
          incidentId,
          incidentTitle,
          workspaceName: localStorage.getItem('airlock_workspace_name'),
          environmentName: localStorage.getItem('airlock_environment_name'),
          advisor,
          complianceImpact: simulation?.compliance?.impact || advisor?.complianceImpact || [],
          complianceFrameworks: simulation?.compliance?.frameworks || ['GDPR', 'ISO_27001', 'EU_AI_ACT'],
        }
        setLastRun(run)
        return run
      } catch (error: any) {
        const detail = error?.response?.data?.error || error?.message || 'Demo flow failed'
        setStep('gateway', { status: 'error', detail })
        setStep('policy', { status: 'error', detail: 'Golden path interrupted' })
        return null
      } finally {
        setFlowRunning(false)
      }
    },
    [ensureDemoPolicy, flowRunning, invalidateDemoQueries, isDemoMode, setStep],
  )

  const value = useMemo<DemoFlowContextValue>(
    () => ({
      isDemoMode,
      seedReady,
      seeding,
      flowRunning,
      lastRun,
      steps,
      runGoldenFlow,
    }),
    [flowRunning, isDemoMode, lastRun, runGoldenFlow, seedReady, seeding, steps],
  )

  return <DemoFlowContext.Provider value={value}>{children}</DemoFlowContext.Provider>
}

export function useDemoFlow() {
  const context = useContext(DemoFlowContext)
  if (!context) {
    throw new Error('useDemoFlow must be used within DemoFlowProvider')
  }
  return context
}

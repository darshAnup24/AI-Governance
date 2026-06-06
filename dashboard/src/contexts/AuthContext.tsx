import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import govApi from '../lib/govApi'

export interface WorkspaceSummary {
  id: string
  name: string
  slug: string
  type?: string
  role?: string
  permissions?: unknown
  environments?: EnvironmentSummary[]
}

export interface EnvironmentSummary {
  id: string
  name: string
  slug: string
  type?: string
}

export interface OrganizationSummary {
  id: string
  name: string
  slug: string
  plan?: string
  industry?: string
}

interface User {
  user_id: string
  email: string
  name: string
  role: string
  department: string
  org_id: string
  organization: OrganizationSummary | null
  permissions: string[]
  workspaces: WorkspaceSummary[]
  activeWorkspace: WorkspaceSummary | null
  activeEnvironment: EnvironmentSummary | null
}

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (payload: SignupPayload) => Promise<void>
  logout: () => void
  loading: boolean
  refreshProfile: () => Promise<void>
  switchWorkspace: (workspaceId: string) => Promise<void>
  switchEnvironment: (environmentId: string) => Promise<void>
}

interface SignupPayload {
  name: string
  email: string
  password: string
  orgName: string
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)
const ACCESS_KEY = 'airlock_token'
const REFRESH_KEY = 'airlock_refresh_token'
const USER_KEY = 'airlock_user'
const WORKSPACE_KEY = 'airlock_workspace_id'
const ENVIRONMENT_KEY = 'airlock_environment_id'

function normalizeUser(data: any): User {
  const workspaces = Array.isArray(data?.workspaces)
    ? data.workspaces.map((workspace: any) => ({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        type: workspace.type,
        role: workspace.role,
        permissions: workspace.permissions,
        environments: Array.isArray(workspace.environments)
          ? workspace.environments.map((environment: any) => ({
              id: environment.id,
              name: environment.name,
              slug: environment.slug,
              type: environment.type,
            }))
          : [],
      }))
    : []

  const activeWorkspaceId = localStorage.getItem(WORKSPACE_KEY)
  const activeWorkspace =
    workspaces.find((workspace: WorkspaceSummary) => workspace.id === activeWorkspaceId) ??
    workspaces[0] ??
    null

  const activeEnvironmentId = localStorage.getItem(ENVIRONMENT_KEY)
  const activeEnvironment =
    (data?.activeEnvironment && (!activeEnvironmentId || data.activeEnvironment.id === activeEnvironmentId)
      ? data.activeEnvironment
      : activeWorkspace?.environments?.find(
          (environment: EnvironmentSummary) => environment.id === activeEnvironmentId,
        )) ??
    activeWorkspace?.environments?.[0] ??
    null

  return {
    user_id: data?.id ?? data?.user_id ?? '',
    email: data?.email ?? '',
    name: data?.name ?? data?.email ?? 'User',
    role: String(data?.role ?? 'viewer').toLowerCase(),
    department: data?.organization?.name ?? data?.org?.name ?? '',
    org_id: data?.organization?.id ?? data?.org?.id ?? '',
    organization: data?.organization ?? data?.org ?? null,
    permissions: Array.isArray(data?.permissions) ? data.permissions : [],
    workspaces,
    activeWorkspace,
    activeEnvironment,
  }
}

function setSession(accessToken: string, refreshToken: string | null, user: User) {
  localStorage.setItem(ACCESS_KEY, accessToken)
  localStorage.setItem('aigw_token', accessToken)
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  localStorage.setItem('aigw_user', JSON.stringify(user))
  if (user.activeWorkspace?.id) localStorage.setItem(WORKSPACE_KEY, user.activeWorkspace.id)
  if (user.activeEnvironment?.id) localStorage.setItem(ENVIRONMENT_KEY, user.activeEnvironment.id)
}

function clearSession() {
  for (const key of [
    ACCESS_KEY,
    REFRESH_KEY,
    USER_KEY,
    WORKSPACE_KEY,
    ENVIRONMENT_KEY,
    'aigw_token',
    'aigw_user',
  ]) {
    localStorage.removeItem(key)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = useCallback(async () => {
    const response = await govApi.get('/api/auth/me')
    const normalized = normalizeUser(response.data)
    setUser(normalized)
    localStorage.setItem(USER_KEY, JSON.stringify(normalized))
    localStorage.setItem('aigw_user', JSON.stringify(normalized))
  }, [])

  useEffect(() => {
    const savedToken = localStorage.getItem(ACCESS_KEY) || localStorage.getItem('aigw_token')
    const savedUser = localStorage.getItem(USER_KEY) || localStorage.getItem('aigw_user')
    if (savedToken) setToken(savedToken)
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser))
      } catch {
        clearSession()
      }
    }
    if (savedToken) {
      void refreshProfile().finally(() => setLoading(false))
      return
    }
    setLoading(false)
  }, [refreshProfile])

  const completeAuth = useCallback(
    async (data: any) => {
      const accessToken = data.accessToken ?? data.access_token
      const refreshToken = data.refreshToken ?? data.refresh_token ?? null
      if (!accessToken) throw new Error('Authentication response did not include an access token')
      setToken(accessToken)
      const me = await govApi.get('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const normalized = normalizeUser(me.data)
      setSession(accessToken, refreshToken, normalized)
      setUser(normalized)
    },
    [],
  )

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await govApi.post('/api/auth/login', { email, password })
      await completeAuth(response.data)
    },
    [completeAuth],
  )

  const signup = useCallback(
    async ({ name, email, password, orgName }: SignupPayload) => {
      const response = await govApi.post('/api/auth/signup', {
        name,
        email,
        password,
        orgName,
      })
      await completeAuth(response.data)
    },
    [completeAuth],
  )

  const switchWorkspace = useCallback(
    async (workspaceId: string) => {
      const response = await govApi.post('/api/auth/switch-workspace', { workspaceId })
      const accessToken = response.data.accessToken ?? token
      if (accessToken) {
        setToken(accessToken)
        localStorage.setItem(ACCESS_KEY, accessToken)
        localStorage.setItem('aigw_token', accessToken)
      }
      localStorage.setItem(WORKSPACE_KEY, workspaceId)
      await refreshProfile()
    },
    [refreshProfile, token],
  )

  const switchEnvironment = useCallback(
    async (environmentId: string) => {
      const response = await govApi.post('/api/auth/switch-environment', { environmentId })
      const accessToken = response.data.accessToken ?? token
      if (accessToken) {
        setToken(accessToken)
        localStorage.setItem(ACCESS_KEY, accessToken)
        localStorage.setItem('aigw_token', accessToken)
      }
      localStorage.setItem(ENVIRONMENT_KEY, environmentId)
      await refreshProfile()
    },
    [refreshProfile, token],
  )

  const logout = useCallback(() => {
    void govApi.post('/api/auth/logout').catch(() => undefined)
    clearSession()
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: !!token,
      login,
      signup,
      logout,
      loading,
      refreshProfile,
      switchWorkspace,
      switchEnvironment,
    }),
    [loading, login, logout, refreshProfile, signup, switchEnvironment, switchWorkspace, token, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

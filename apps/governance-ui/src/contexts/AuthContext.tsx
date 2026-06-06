import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { governanceApi } from '@airlock/shared-ui'

interface User {
  id: string
  email: string
  name: string
  role: string
  title?: string
  organization?: { id: string; name: string; slug: string; plan: string; industry?: string; logo?: string; settings?: any; features?: any }
  workspaces?: Array<{ id: string; name: string; slug: string; type: string }>
  workspace?: { id: string; name: string; slug: string }
  mfaEnabled?: boolean
  emailVerified?: boolean
  preferences?: Record<string, any>
}

interface AuthContextType {
  user: User | null
  token: string | null
  refreshToken: string | null
  loading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<any>
  signup: (name: string, email: string, password: string, orgName: string) => Promise<any>
  logout: () => void
  switchWorkspace: (workspaceId: string) => Promise<void>
  refreshAuth: () => Promise<void>
  hasRole: (roles: string[]) => boolean
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const TOKEN_KEY = 'airlock_token'
const REFRESH_KEY = 'airlock_refresh'
const USER_KEY = 'airlock_user'

function parseJwtPayload(token: string): any {
  try { return JSON.parse(atob(token.split('.')[1])) } catch { return null }
}

function isTokenExpiringSoon(token: string, bufferSeconds = 300): boolean {
  const payload = parseJwtPayload(token)
  if (!payload?.exp) return true
  return Date.now() >= (payload.exp * 1000) - (bufferSeconds * 1000)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try { const s = localStorage.getItem(USER_KEY); return s ? JSON.parse(s) : null } catch { return null }
  })
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [refreshToken, setRefreshToken] = useState<string | null>(() => localStorage.getItem(REFRESH_KEY))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isAuthenticated = !!token && !!user

  const persistAuth = useCallback((newToken: string, newRefresh: string, newUser: User) => {
    localStorage.setItem(TOKEN_KEY, newToken)
    localStorage.setItem(REFRESH_KEY, newRefresh)
    localStorage.setItem(USER_KEY, JSON.stringify(newUser))
    setToken(newToken)
    setRefreshToken(newRefresh)
    setUser(newUser)
  }, [])

  const clearAuth = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setRefreshToken(null)
    setUser(null)
    if (refreshTimerRef.current) { clearTimeout(refreshTimerRef.current); refreshTimerRef.current = null }
  }, [])

  const doRefresh = useCallback(async (rt: string) => {
    try {
      const res = await governanceApi.post('/api/auth/refresh', { refreshToken: rt })
      const { accessToken, refreshToken: newRt, workspace } = res.data
      const payload = parseJwtPayload(accessToken)
      if (payload && user) {
        const updatedUser = { ...user, workspace: workspace || user.workspace }
        persistAuth(accessToken, newRt || rt, updatedUser)
        scheduleRefresh(newRt || rt)
      }
    } catch { clearAuth() }
  }, [user, persistAuth, clearAuth])

  const scheduleRefresh = useCallback((rt: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = setTimeout(() => doRefresh(rt), 55 * 60 * 1000)
  }, [doRefresh])

  useEffect(() => {
    if (token && refreshToken) scheduleRefresh(refreshToken)
    setLoading(false)
  }, []) // eslint-disable-line

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true); setError(null)
    try {
      const res = await governanceApi.post('/api/auth/login', { email, password })
      const { user: userData, accessToken, refreshToken: newRt } = res.data
      persistAuth(accessToken, newRt || '', userData)
      scheduleRefresh(newRt || '')
      return res.data
    } catch (err: any) {
      if (err.response?.status === 401 && err.response?.data?.mfaRequired) {
        throw { mfaRequired: true, tempToken: err.response.data.tempToken }
      }
      setError(err.response?.data?.error || err.message || 'Login failed')
      throw err
    } finally { setLoading(false) }
  }, [persistAuth, scheduleRefresh])

  const logout = useCallback(async () => {
    try { if (token) await governanceApi.post('/api/auth/logout', {}, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {}) } finally { clearAuth() }
  }, [token, clearAuth])

  const switchWorkspace = useCallback(async (workspaceId: string) => {
    if (!token) return
    try {
      const res = await governanceApi.post('/api/auth/switch-workspace', { workspaceId }, { headers: { Authorization: `Bearer ${token}` } })
      const { accessToken, refreshToken: newRt, workspace, role } = res.data
      if (user) {
        const updatedUser = { ...user, workspace, role }
        persistAuth(accessToken, newRt || refreshToken || '', updatedUser)
        scheduleRefresh(newRt || refreshToken || '')
      }
    } catch (err: any) { setError(err.response?.data?.error || 'Failed to switch workspace') }
  }, [token, user, refreshToken, persistAuth, scheduleRefresh])

  const refreshAuth = useCallback(async () => {
    if (refreshToken) await doRefresh(refreshToken)
  }, [refreshToken, doRefresh])

  const signup = useCallback(async (name: string, email: string, password: string, orgName: string) => {
    const res = await governanceApi.post('/api/auth/signup', { name, email, password, orgName })
    return res.data
  }, [])

  const hasRole = useCallback((roles: string[]) => {
    return user ? roles.includes(user.role) : false
  }, [user])

  return (
    <AuthContext.Provider value={{ user, token, refreshToken, loading, error, login, signup, logout, switchWorkspace, refreshAuth, hasRole, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { demoApi } from '@airlock/shared-ui'

interface LabUser {
  id: string
  email: string
  name: string
  role: string
  title?: string
  org?: { id: string; name: string; slug: string; plan: string }
  workspace?: { id: string; name: string; slug: string }
  workspaces?: Array<{ id: string; name: string; slug: string; type: string }>
  mfaEnabled?: boolean
  emailVerified?: boolean
  preferences?: Record<string, any>
}

interface LabAuthContextType {
  user: LabUser | null
  token: string | null
  refreshToken: string | null
  loading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  switchWorkspace: (workspaceId: string) => Promise<void>
  isAuthenticated: boolean
  isDemoMode: boolean
}

const LabAuthContext = createContext<LabAuthContextType | undefined>(undefined)

const TOKEN_KEY = 'airlock_lab_token'
const REFRESH_KEY = 'airlock_lab_refresh'
const USER_KEY = 'airlock_lab_user'

function parseJwtPayload(token: string): any {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return null
  }
}

function isTokenExpiringSoon(token: string, bufferSeconds = 300): boolean {
  const payload = parseJwtPayload(token)
  if (!payload?.exp) return true
  return Date.now() >= (payload.exp * 1000) - (bufferSeconds * 1000)
}

export function LabAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LabUser | null>(() => {
    try {
      const stored = localStorage.getItem(USER_KEY)
      return stored ? JSON.parse(stored) : null
    } catch { return null }
  })
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [refreshToken, setRefreshToken] = useState<string | null>(() => localStorage.getItem(REFRESH_KEY))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isAuthenticated = !!token && !!user

  const persistAuth = useCallback((newToken: string, newRefresh: string, newUser: LabUser) => {
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
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = null
    }
  }, [])

  const scheduleRefresh = useCallback((currentRefreshToken: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)

    refreshTimerRef.current = setTimeout(async () => {
      try {
        const res = await demoApi.post('/auth/refresh', { refreshToken: currentRefreshToken })
        const { accessToken, refreshToken: newRefresh } = res.data
        const payload = parseJwtPayload(accessToken)
        if (payload) {
          const newUser: LabUser = {
            id: payload.userId || payload.sub,
            email: payload.email || '',
            name: payload.name || payload.email || 'User',
            role: payload.role || 'VIEWER',
          }
          persistAuth(accessToken, newRefresh || currentRefreshToken, newUser)
          scheduleRefresh(newRefresh || currentRefreshToken)
        }
      } catch {
        clearAuth()
      }
    }, 55 * 60 * 1000)
  }, [persistAuth, clearAuth])

  useEffect(() => {
    if (token && refreshToken) {
      if (isTokenExpiringSoon(token)) {
        scheduleRefresh(refreshToken)
      } else {
        scheduleRefresh(refreshToken)
      }
    }
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await demoApi.post('/auth/login', { email, password })
      const { accessToken, refreshToken: newRefresh, user: userData } = res.data
      const newUser: LabUser = {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        role: userData.role,
        title: userData.title,
        org: userData.org,
        workspace: userData.workspace,
        workspaces: userData.workspaces,
        mfaEnabled: userData.mfaEnabled,
        emailVerified: userData.emailVerified,
        preferences: userData.preferences,
      }
      persistAuth(accessToken, newRefresh || '', newUser)
      scheduleRefresh(newRefresh || '')
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Login failed')
      throw err
    } finally {
      setLoading(false)
    }
  }, [persistAuth, scheduleRefresh])

  const logout = useCallback(async () => {
    try {
      if (token) {
        await demoApi.post('/auth/logout', {}, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => {})
      }
    } finally {
      clearAuth()
    }
  }, [token, clearAuth])

  const switchWorkspace = useCallback(async (workspaceId: string) => {
    if (!token) return
    try {
      const res = await demoApi.post('/auth/switch-workspace', { workspaceId }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const { accessToken, refreshToken: newRefresh, workspace, role } = res.data
      if (user) {
        const updatedUser = { ...user, workspace, role }
        persistAuth(accessToken, newRefresh || refreshToken || '', updatedUser)
        scheduleRefresh(newRefresh || refreshToken || '')
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to switch workspace')
      throw err
    }
  }, [token, user, refreshToken, persistAuth, scheduleRefresh])

  return (
    <LabAuthContext.Provider value={{ user, token, refreshToken, loading, error, login, logout, switchWorkspace, isAuthenticated, isDemoMode: true }}>
      {children}
    </LabAuthContext.Provider>
  )
}

export function useLabAuth() {
  const ctx = useContext(LabAuthContext)
  if (!ctx) throw new Error('useLabAuth must be used within LabAuthProvider')
  return ctx
}

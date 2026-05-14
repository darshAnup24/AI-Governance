import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import govApi from '../lib/govApi'

interface User {
    user_id: string
    email: string
    role: string
    department: string
    org_id: string
}

interface AuthContextType {
    user: User | null
    token: string | null
    isAuthenticated: boolean
    login: (email: string, password: string) => Promise<void>
    logout: () => void
    loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)
const TOKEN_KEYS = ['aigw_token', 'shieldai_token'] as const
const USER_KEYS = ['aigw_user', 'shieldai_user'] as const

function getStoredValue(keys: readonly string[]): string | null {
    for (const key of keys) {
        const value = localStorage.getItem(key)
        if (value) return value
    }
    return null
}

function setSession(token: string, user: User) {
    localStorage.setItem('aigw_token', token)
    localStorage.setItem('shieldai_token', token)
    localStorage.setItem('aigw_user', JSON.stringify(user))
    localStorage.setItem('shieldai_user', JSON.stringify(user))
}

function clearSession() {
    for (const key of TOKEN_KEYS) localStorage.removeItem(key)
    for (const key of USER_KEYS) localStorage.removeItem(key)
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [token, setToken] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        // Restore session from localStorage
        const savedToken = getStoredValue(TOKEN_KEYS)
        const savedUser = getStoredValue(USER_KEYS)
        if (savedToken && savedUser) {
            setToken(savedToken)
            setUser(JSON.parse(savedUser))
        }
        setLoading(false)
    }, [])

    const login = useCallback(async (email: string, password: string) => {
        const response = await govApi.post('/api/auth/login', { email, password })
        const data = response.data

        const authUser: User = {
            user_id: data.user?.id ?? '',
            email: data.user?.email ?? email,
            role: String(data.user?.role ?? 'user').toLowerCase(),
            department: data.user?.org?.name ?? data.user?.organization?.name ?? '',
            org_id: data.user?.org?.id ?? data.user?.organization?.id ?? '',
        }

        const accessToken = data.accessToken ?? data.access_token
        if (!accessToken) {
            throw new Error('Authentication response did not include an access token')
        }

        setSession(accessToken, authUser)
        setToken(accessToken)
        setUser(authUser)
    }, [])

    const logout = useCallback(() => {
        clearSession()
        setToken(null)
        setUser(null)
    }, [])

    return (
        <AuthContext.Provider
            value={{ user, token, isAuthenticated: !!token, login, logout, loading }}
        >
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}

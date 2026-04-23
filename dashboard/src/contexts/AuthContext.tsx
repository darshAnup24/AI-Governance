import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'

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

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [token, setToken] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        // Restore session from localStorage
        const savedToken = localStorage.getItem('aigw_token')
        const savedUser = localStorage.getItem('aigw_user')
        if (savedToken && savedUser) {
            setToken(savedToken)
            setUser(JSON.parse(savedUser))
        }
        setLoading(false)
    }, [])

    const login = useCallback(async (email: string, _password: string) => {
        // Dev mode: create a mock JWT and user for local development
        // In production, this calls the corporate IdP
        const mockUser: User = {
            user_id: 'dev-user-001',
            email,
            role: 'admin',
            department: 'engineering',
            org_id: 'org-001',
        }
        const mockToken = 'dev-token-' + btoa(email)

        localStorage.setItem('aigw_token', mockToken)
        localStorage.setItem('aigw_user', JSON.stringify(mockUser))
        setToken(mockToken)
        setUser(mockUser)
    }, [])

    const logout = useCallback(() => {
        localStorage.removeItem('aigw_token')
        localStorage.removeItem('aigw_user')
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

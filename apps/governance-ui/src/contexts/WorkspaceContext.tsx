import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { governanceApi } from '@airlock/shared-ui'
import { useAuth } from './AuthContext'

interface Workspace {
  id: string
  name: string
  slug: string
  type: string
  description: string | null
}

interface WorkspaceContextType {
  workspaces: Workspace[]
  currentWorkspace: Workspace | null
  loading: boolean
  switchWorkspace: (workspaceId: string) => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined)

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null)
  const [loading, setLoading] = useState(true)

  const loadWorkspaces = useCallback(async () => {
    if (!user?.organization?.id) {
      setLoading(false)
      return
    }
    try {
      const res = await governanceApi.get(`/organization/${user.organization.id}/workspaces`)
      const list: Workspace[] = res.data.workspaces || []
      setWorkspaces(list)

      const savedId = localStorage.getItem('airlock_workspace_id')
      const found = savedId ? list.find((w) => w.id === savedId) : null
      const selected = found || list[0] || null
      if (selected) {
        localStorage.setItem('airlock_workspace_id', selected.id)
        setCurrentWorkspace(selected)
      }
    } catch {
      // workspaces unavailable
    } finally {
      setLoading(false)
    }
  }, [user?.organization?.id])

  useEffect(() => {
    loadWorkspaces()
  }, [loadWorkspaces])

  const switchWorkspace = useCallback(async (workspaceId: string) => {
    const ws = workspaces.find((w) => w.id === workspaceId)
    if (!ws) return
    localStorage.setItem('airlock_workspace_id', ws.id)
    setCurrentWorkspace(ws)
    try {
      await governanceApi.post('/auth/switch-workspace', { workspaceId })
    } catch {
      // non-critical
    }
  }, [workspaces])

  return (
    <WorkspaceContext.Provider value={{ workspaces, currentWorkspace, loading, switchWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}

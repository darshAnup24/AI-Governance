import { Navigate, Outlet } from 'react-router-dom'
import { useLabAuth } from '../contexts/LabAuthContext'
import { Loader2 } from 'lucide-react'

export function LabProtectedRoute() {
  const { isAuthenticated, loading } = useLabAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--background)]">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    )
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/lab-login" replace />
}

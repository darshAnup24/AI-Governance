import { useState } from 'react'

interface Workspace {
  id: string
  name: string
  slug: string
  type: string
}

interface WorkspaceSwitcherProps {
  workspaces: Workspace[]
  currentWorkspace: Workspace | null
  onSwitch: (workspaceId: string) => void
}

export function WorkspaceSwitcher({ workspaces, currentWorkspace, onSwitch }: WorkspaceSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (!workspaces || workspaces.length === 0) return null

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-[var(--border)] hover:bg-[var(--muted)] transition-colors w-full"
      >
        <div className="w-6 h-6 rounded bg-indigo-100 flex items-center justify-center text-xs font-medium text-indigo-600">
          {currentWorkspace?.name?.charAt(0) || 'W'}
        </div>
        <div className="flex-1 text-left truncate">
          <div className="font-medium truncate">{currentWorkspace?.name || 'Select Workspace'}</div>
          <div className="text-xs text-gray-500">{currentWorkspace?.type || ''}</div>
        </div>
        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute z-50 mt-1 w-full bg-white rounded-lg shadow-lg border border-[var(--border)] py-1 max-h-60 overflow-auto">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => { onSwitch(ws.id); setIsOpen(false) }}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[var(--muted)] transition-colors ${
                  currentWorkspace?.id === ws.id ? 'bg-indigo-50 text-indigo-600' : ''
                }`}
              >
                <div className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center text-xs font-medium">
                  {ws.name.charAt(0)}
                </div>
                <div className="text-left">
                  <div className="font-medium">{ws.name}</div>
                  <div className="text-xs text-gray-500">{ws.type}</div>
                </div>
                {currentWorkspace?.id === ws.id && (
                  <svg className="w-4 h-4 ml-auto text-indigo-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

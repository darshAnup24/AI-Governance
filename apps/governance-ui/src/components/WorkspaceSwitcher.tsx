import { useState } from 'react'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { Check, ChevronDown, Building2 } from 'lucide-react'

export default function WorkspaceSwitcher() {
  const { workspaces, currentWorkspace, switchWorkspace } = useWorkspace()
  const [open, setOpen] = useState(false)

  if (workspaces.length === 0) return null

  return (
    <div className="relative px-3 mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-slate-800/40 border border-slate-800/60 transition-colors"
      >
        <Building2 className="w-4 h-4 flex-shrink-0 text-[var(--accent)]" />
        <span className="truncate flex-1 text-left text-slate-200 font-medium">
          {currentWorkspace?.name || 'Select workspace'}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-3 right-3 top-full mt-1.5 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl z-50 py-1.5">
            <p className="px-3 py-1.5 text-xs font-semibold text-[var(--muted-foreground)]/60 uppercase tracking-[0.1em] font-mono">Workspaces</p>
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => { switchWorkspace(ws.id); setOpen(false) }}
                className="flex items-center gap-3 w-full px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
              >
                <Building2 className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                <span className="flex-1 text-left truncate">{ws.name}</span>
                {ws.id === currentWorkspace?.id && (
                  <Check className="w-3.5 h-3.5 text-[var(--accent)]" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}


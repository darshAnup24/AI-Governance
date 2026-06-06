import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Plus, FileText, Clock, User, Trash2 } from 'lucide-react'

interface AuditEntry {
  id: string
  userId: string
  action: string
  timestamp: string
  [key: string]: unknown
}

const ACTION_PRESETS = ['prompt_inspect', 'policy_simulate', 'attack_replay', 'shadow_ai_scan', 'chat_gateway_test']

export default function AuditIncidents() {
  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [logAction, setLogAction] = useState('prompt_inspect')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('airlock_lab_token')
      const res = await fetch('/api/demo/audit/logs', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setLogs(Array.isArray(data) ? data.reverse() : [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLogs()
    const interval = setInterval(fetchLogs, 5000)
    return () => clearInterval(interval)
  }, [fetchLogs])

  const logEvent = async () => {
    setPosting(true)
    try {
      const token = localStorage.getItem('airlock_lab_token')
      await fetch('/api/demo/audit/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: logAction, source: 'lab-ui', details: { manual: true } }),
      })
      await fetchLogs()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setPosting(false) }
  }

  const formatTime = (ts: string) => {
    try { return new Date(ts).toLocaleTimeString() } catch { return ts }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-500 mb-1">Monitoring</p>
          <h1 className="text-2xl font-bold text-gray-100">Audit &amp; Incidents</h1>
          <p className="text-sm text-gray-500 mt-1">
            Live sandbox audit log — auto-refreshes every 5s
            {loading && <RefreshCw className="inline-block w-3 h-3 ml-2 animate-spin text-emerald-400" />}
          </p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 text-xs transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Log Event Panel */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5">
        <h3 className="text-sm font-semibold text-gray-100 mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-emerald-400" /> Log Sandbox Event
        </h3>
        <div className="flex gap-3">
          <select
            value={logAction}
            onChange={(e) => setLogAction(e.target.value)}
            className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {ACTION_PRESETS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button
            onClick={logEvent}
            disabled={posting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
          >
            {posting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Log Event
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-900/20 rounded-lg px-3 py-2 border border-red-800/40">{error}</p>
      )}

      {/* Log Table */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-100 flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-500" /> Sandbox Audit Log
          </h3>
          <span className="text-xs text-gray-500">{logs.length} entries</span>
        </div>
        <div className="overflow-x-auto">
          {logs.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-gray-600 text-sm">
              No audit events yet. Log one above or trigger a lab action.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Time</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">ID</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1.5 text-xs text-gray-500 font-mono">
                        <Clock className="w-3 h-3" />
                        {formatTime(entry.timestamp)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-emerald-900/20 text-emerald-400 border border-emerald-800/30">
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1.5 text-xs text-gray-400">
                        <User className="w-3 h-3 text-gray-600" />
                        {entry.userId || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-[10px] text-gray-600">{entry.id?.slice(0, 8)}…</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

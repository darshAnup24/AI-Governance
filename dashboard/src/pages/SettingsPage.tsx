import { Settings, Save } from 'lucide-react'

export default function SettingsPage() {
    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h1 className="text-2xl font-bold text-slate-100">Settings</h1>
                <p className="text-slate-500 mt-1">Configure your AI Governance Firewall</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card space-y-4">
                    <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                        <Settings className="w-5 h-5 text-brand-400" />
                        General Settings
                    </h2>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">Organization Name</label>
                        <input className="input w-full" placeholder="Your Company" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">Default Action on Detection</label>
                        <select className="input w-full" defaultValue="WARN">
                            <option value="ALLOW">Allow + Log</option>
                            <option value="WARN">Warn User</option>
                            <option value="REDACT">Redact Content</option>
                            <option value="BLOCK">Block Request</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">Detection Sensitivity</label>
                        <input type="range" min="0" max="100" defaultValue="60"
                            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-brand-500" />
                        <div className="flex justify-between text-xs text-slate-500 mt-1">
                            <span>Low (fewer alerts)</span>
                            <span>High (more alerts)</span>
                        </div>
                    </div>
                    <button className="btn-primary flex items-center gap-2">
                        <Save className="w-4 h-4" /> Save Changes
                    </button>
                </div>

                <div className="card space-y-4">
                    <h2 className="text-lg font-semibold text-slate-100">System Status</h2>
                    {[
                        { name: 'Proxy Service', status: 'healthy', port: 8000 },
                        { name: 'Detection Engine', status: 'healthy', port: 8001 },
                        { name: 'PostgreSQL', status: 'healthy', port: 5432 },
                        { name: 'Redis', status: 'healthy', port: 6379 },
                        { name: 'Ollama', status: 'pending', port: 11434 },
                    ].map(svc => (
                        <div key={svc.name} className="flex items-center justify-between py-2 border-b border-slate-800/50 last:border-0">
                            <div>
                                <p className="text-sm font-medium text-slate-200">{svc.name}</p>
                                <p className="text-xs text-slate-500">Port {svc.port}</p>
                            </div>
                            <span className={svc.status === 'healthy' ? 'badge-green' : 'badge-yellow'}>{svc.status}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

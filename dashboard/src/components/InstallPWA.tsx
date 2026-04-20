import { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('pwa-dismissed')) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Show the prompt after 30 seconds
      setTimeout(() => setVisible(true), 30_000)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setVisible(false)
    }
  }

  const handleDismiss = () => {
    setVisible(false)
    setDismissed(true)
    localStorage.setItem('pwa-dismissed', '1')
  }

  if (!visible || dismissed) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm px-4 animate-slide-up">
      <div className="card border border-brand-500/30 bg-slate-900/95 backdrop-blur-xl shadow-2xl shadow-brand-500/10 flex items-start gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-cyan-500 rounded-lg flex items-center justify-center flex-shrink-0">
          <Download className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-100">Install ShieldAI</p>
          <p className="text-xs text-slate-400 mt-0.5">Add to your home screen for offline access</p>
          <div className="flex gap-2 mt-3">
            <button onClick={handleInstall} className="btn-primary text-xs py-1.5 px-3">
              Install
            </button>
            <button onClick={handleDismiss} className="btn-secondary text-xs py-1.5 px-3">
              Not now
            </button>
          </div>
        </div>
        <button onClick={handleDismiss} className="text-slate-600 hover:text-slate-400 flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

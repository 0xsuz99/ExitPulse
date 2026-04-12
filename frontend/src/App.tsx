import { useState, useMemo, useEffect } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import { useSignals } from './hooks/useApi'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Dashboard from './components/Dashboard'
import SignalFeed from './components/SignalFeed'
import Holdings from './components/Holdings'
import TrackedWallets from './components/TrackedWallets'
import HowItWorks from './components/HowItWorks'
import Settings from './components/Settings'
import TelegramConnect from './components/TelegramConnect'
import LiveEngineStatus from './components/LiveEngineStatus'

type Tab = 'dashboard' | 'how-it-works' | 'settings'

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [dismissedSignalIds, setDismissedSignalIds] = useState<Record<string, boolean>>({})
  const ws = useWebSocket()
  const { data: apiSignals } = useSignals()

  function handleTabChange(nextTab: Tab) {
    if (nextTab === activeTab) return
    if (activeTab === 'settings' && settingsDirty) {
      const confirmed = window.confirm('You have unsaved settings changes. Leave without saving?')
      if (!confirmed) return
      setSettingsDirty(false)
    }
    setActiveTab(nextTab)
  }

  // Merge WS live signals with API-polled signals, then keep only the newest signal per token.
  const allSignals = useMemo(() => {
    const apiList = Array.isArray(apiSignals?.signals) ? apiSignals.signals : []
    const combined = [...ws.signals, ...apiList]
      .filter(Boolean)
      .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))

    const byToken = new Map<string, any>()
    for (const signal of combined) {
      const tokenKey = `${(signal.chain || '').toLowerCase()}:${
        (signal.tokenAddress || signal.tokenSymbol || signal.id || '').toLowerCase()
      }`
      if (!byToken.has(tokenKey)) {
        byToken.set(tokenKey, signal)
      }
    }

    return Array.from(byToken.values())
      .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 50)
  }, [ws.signals, apiSignals])

  useEffect(() => {
    const activeIds = new Set(allSignals.map((signal: any) => signal.id))
    setDismissedSignalIds(prev => {
      let changed = false
      const next: Record<string, boolean> = {}
      for (const [id, dismissed] of Object.entries(prev)) {
        if (!dismissed) continue
        if (activeIds.has(id)) {
          next[id] = true
        } else {
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [allSignals])

  const visibleSignals = useMemo(
    () => allSignals.filter((signal: any) => !dismissedSignalIds[signal.id]),
    [allSignals, dismissedSignalIds]
  )

  function handleDismissSignal(signalId: string, dismissed: boolean) {
    setDismissedSignalIds(prev => {
      if (dismissed) {
        if (prev[signalId]) return prev
        return { ...prev, [signalId]: true }
      }
      if (!prev[signalId]) return prev
      const next = { ...prev }
      delete next[signalId]
      return next
    })
  }

  return (
    <div className="min-h-screen bg-pulse-bg">
      <Navbar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        signalCount={visibleSignals.length}
      />

      {activeTab === 'dashboard' && (
        <>
          <Hero latestSignal={ws.latestSignal} />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 space-y-6">
            <Dashboard />
            <LiveEngineStatus />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <SignalFeed signals={visibleSignals} onDismissSignal={handleDismissSignal} />
              </div>
              <div className="space-y-6">
                <Holdings />
                <TelegramConnect />
                <TrackedWallets />
              </div>
            </div>
          </main>
        </>
      )}

      {activeTab === 'how-it-works' && (
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <HowItWorks />
        </main>
      )}

      {activeTab === 'settings' && (
        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <Settings onDirtyChange={setSettingsDirty} />
        </main>
      )}
    </div>
  )
}

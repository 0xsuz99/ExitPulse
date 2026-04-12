import { useState, useEffect, useMemo } from 'react'
import { useUserConfig, useUpdateConfig } from '../hooks/useApi'
import { motion } from 'framer-motion'
import { Sliders, Send, Shield, ToggleLeft, ToggleRight, Rocket, Wallet } from 'lucide-react'

interface SettingsProps {
  onDirtyChange?: (dirty: boolean) => void
}

export default function Settings({ onDirtyChange }: SettingsProps) {
  const { data } = useUserConfig()
  const updateConfig = useUpdateConfig()

  const [mode, setMode] = useState<'manual' | 'auto'>('manual')
  const [runtimeMode, setRuntimeMode] = useState<'demo' | 'live'>('demo')
  const [notifyThreshold, setNotifyThreshold] = useState(1.5)
  const [autoExitThreshold, setAutoExitThreshold] = useState(3.0)
  const [criticalThreshold, setCriticalThreshold] = useState(5.0)
  const [windowMinutes, setWindowMinutes] = useState(15)
  const [trackedWalletLimit, setTrackedWalletLimit] = useState(50)
  const [chain, setChain] = useState('bsc')

  useEffect(() => {
    if (!data) return

    setMode(data.config?.mode || 'manual')
    setRuntimeMode(data.config?.runtimeMode || 'demo')
    setChain(data.config?.chain || 'bsc')
    setTrackedWalletLimit(data.config?.trackedWalletLimit || 50)

    if (data.cesConfig) {
      setNotifyThreshold(data.cesConfig.notifyThreshold)
      setAutoExitThreshold(data.cesConfig.autoExitThreshold)
      setCriticalThreshold(data.cesConfig.criticalThreshold)
      setWindowMinutes(data.cesConfig.windowMinutes)
    }
  }, [data])

  const hasUnsavedChanges = useMemo(() => {
    if (!data) return false

    const savedMode = data.config?.mode || 'manual'
    const savedRuntimeMode = data.config?.runtimeMode || 'demo'
    const savedChain = data.config?.chain || 'bsc'
    const savedTrackedLimit = data.config?.trackedWalletLimit || 50
    const savedNotify = data.cesConfig?.notifyThreshold ?? 1.5
    const savedAutoExit = data.cesConfig?.autoExitThreshold ?? 3.0
    const savedCritical = data.cesConfig?.criticalThreshold ?? 5.0
    const savedWindow = data.cesConfig?.windowMinutes ?? 15

    return (
      mode !== savedMode ||
      runtimeMode !== savedRuntimeMode ||
      chain !== savedChain ||
      trackedWalletLimit !== savedTrackedLimit ||
      notifyThreshold !== savedNotify ||
      autoExitThreshold !== savedAutoExit ||
      criticalThreshold !== savedCritical ||
      windowMinutes !== savedWindow
    )
  }, [
    data,
    mode,
    runtimeMode,
    chain,
    trackedWalletLimit,
    notifyThreshold,
    autoExitThreshold,
    criticalThreshold,
    windowMinutes,
  ])

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges)
  }, [hasUnsavedChanges, onDirtyChange])

  useEffect(() => {
    if (!hasUnsavedChanges) return

    const beforeUnloadHandler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', beforeUnloadHandler)
    return () => {
      window.removeEventListener('beforeunload', beforeUnloadHandler)
    }
  }, [hasUnsavedChanges])

  function handleSave() {
    updateConfig.mutate({
      mode,
      runtimeMode,
      trackedWalletLimit,
      chain,
      cesConfig: {
        notifyThreshold,
        autoExitThreshold,
        criticalThreshold,
        windowMinutes,
      },
    })
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-white mb-2">Settings</h1>
        <p className="text-pulse-muted">Tune execution, runtime mode, and risk controls.</p>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Rocket className="w-5 h-5 text-pulse-warning" />
          <h2 className="text-lg font-bold text-white">Runtime Mode</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => setRuntimeMode('demo')}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              runtimeMode === 'demo'
                ? 'border-pulse-warning bg-pulse-warning/5'
                : 'border-pulse-border hover:border-pulse-border/60'
            }`}
          >
            <div className="font-bold text-white mb-1">Demo</div>
            <p className="text-xs text-pulse-muted">Simulated stream + execution previews for walkthroughs, no real on-chain swaps.</p>
          </button>

          <button
            onClick={() => setRuntimeMode('live')}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              runtimeMode === 'live'
                ? 'border-pulse-accent bg-pulse-accent/5'
                : 'border-pulse-border hover:border-pulse-border/60'
            }`}
          >
            <div className="font-bold text-white mb-1">Live</div>
            <p className="text-xs text-pulse-muted">Uses live stream + real wallet context with real on-chain execution paths.</p>
          </button>
        </div>

      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-5 h-5 text-pulse-accent" />
          <h2 className="text-lg font-bold text-white">Exit Mode</h2>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMode('manual')}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              mode === 'manual'
                ? 'border-pulse-accent bg-pulse-accent/5'
                : 'border-pulse-border hover:border-pulse-border/60'
            }`}
          >
            <div className="flex items-center gap-2">
              <ToggleLeft className={`w-5 h-5 ${mode === 'manual' ? 'text-pulse-accent' : 'text-pulse-muted'}`} />
              <span className={`font-bold ${mode === 'manual' ? 'text-white' : 'text-pulse-muted'}`}>Manual</span>
            </div>
          </button>

          <button
            onClick={() => setMode('auto')}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              mode === 'auto'
                ? 'border-pulse-danger bg-pulse-danger/5'
                : 'border-pulse-border hover:border-pulse-border/60'
            }`}
          >
            <div className="flex items-center gap-2">
              <ToggleRight className={`w-5 h-5 ${mode === 'auto' ? 'text-pulse-danger' : 'text-pulse-muted'}`} />
              <span className={`font-bold ${mode === 'auto' ? 'text-white' : 'text-pulse-muted'}`}>Auto</span>
            </div>
          </button>
        </div>

        <p className="mt-3 text-xs text-pulse-muted">
          {mode === 'auto'
            ? 'Critical signals auto-execute immediately. Non-critical signals can be approved via Telegram.'
            : 'All signals require manual approval from the dashboard. Telegram sends notifications only.'}
        </p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Wallet className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-bold text-white">Tracked Wallet Universe</h2>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-pulse-muted">Top wallets to monitor</label>
            <span className="text-sm font-mono font-bold text-blue-400">{trackedWalletLimit}</span>
          </div>
          <input
            type="range"
            min="30"
            max="100"
            step="10"
            value={trackedWalletLimit}
            onChange={(e) => setTrackedWalletLimit(parseInt(e.target.value))}
            className="w-full accent-blue-400"
          />
          <p className="text-xs text-pulse-muted mt-2">
            Higher values improve consensus quality but can increase signal noise.
          </p>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Sliders className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-bold text-white">Execution Chain</h2>
        </div>

        <p className="text-xs text-pulse-muted mb-3">
          Used as the default chain for exits when wallet context is ambiguous.
        </p>

        <div className="grid grid-cols-4 gap-2">
          {['bsc', 'solana', 'eth', 'base'].map((c) => (
            <button
              key={c}
              onClick={() => setChain(c)}
              className={`p-3 rounded-lg text-center text-sm font-semibold transition-all ${
                chain === c
                  ? 'bg-pulse-accent/10 text-pulse-accent border border-pulse-accent/30'
                  : 'bg-pulse-bg text-pulse-muted border border-pulse-border hover:border-pulse-muted/30'
              }`}
            >
              {c.toUpperCase()}
            </button>
          ))}
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Sliders className="w-5 h-5 text-pulse-warning" />
          <h2 className="text-lg font-bold text-white">Signal Sensitivity</h2>
        </div>

        <div className="rounded-lg border border-pulse-border bg-pulse-bg/50 p-3 mb-5">
          <p className="text-xs text-pulse-muted leading-relaxed">
            <strong className="text-pulse-text">Consensus Exit Score (CES)</strong> aggregates exit signals from top-performing wallets.
            Each wallet exit is scored: <code className="text-blue-400">wallet_weight x exit_ratio x hold_factor</code>.
            Higher CES = stronger consensus that smart money is leaving a token.
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-pulse-text">Early Warning</label>
              <span className="text-sm font-mono font-bold text-pulse-warning">{notifyThreshold}</span>
            </div>
            <p className="text-xs text-pulse-muted mb-2">
              Fires a notification when 2-3 mid-tier wallets exit. Low urgency — just a heads up so you can monitor.
            </p>
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.1"
              value={notifyThreshold}
              onChange={(e) => setNotifyThreshold(parseFloat(e.target.value))}
              className="w-full accent-pulse-warning"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-pulse-text">High-Risk Trigger</label>
              <span className="text-sm font-mono font-bold text-pulse-danger">{autoExitThreshold}</span>
            </div>
              <p className="text-xs text-pulse-muted mb-2">
              Strong consensus warning threshold. At or above this level, the signal is escalated as high-risk and asks for approval. Auto execution is reserved for critical panic level.
              </p>
            <input
              type="range"
              min="1"
              max="10"
              step="0.1"
              value={autoExitThreshold}
              onChange={(e) => setAutoExitThreshold(parseFloat(e.target.value))}
              className="w-full accent-pulse-danger"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-pulse-text">Critical Panic</label>
              <span className="text-sm font-mono font-bold text-red-400">{criticalThreshold}</span>
            </div>
            <p className="text-xs text-pulse-muted mb-2">
              Mass exodus by top-ranked wallets. Immediate action strongly recommended — usually means something serious (exploit, rug, whale dump).
            </p>
            <input
              type="range"
              min="2"
              max="15"
              step="0.1"
              value={criticalThreshold}
              onChange={(e) => setCriticalThreshold(parseFloat(e.target.value))}
              className="w-full accent-red-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-pulse-text">Consensus Window</label>
              <span className="text-sm font-mono font-bold text-blue-400">{windowMinutes} min</span>
            </div>
            <p className="text-xs text-pulse-muted mb-2">
              Time window for grouping exits into a single score. Shorter windows catch rapid dumps faster, longer windows catch coordinated slow exits.
            </p>
            <input
              type="range"
              min="5"
              max="60"
              step="5"
              value={windowMinutes}
              onChange={(e) => setWindowMinutes(parseInt(e.target.value))}
              className="w-full accent-blue-400"
            />
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Send className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-bold text-white">Telegram</h2>
        </div>

        <p className="text-sm text-pulse-muted">
          Use the <strong className="text-white">Connect Telegram</strong> card on the dashboard for full in-app setup.
          No manual .env editing required.
        </p>

        <div className="mt-4 flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${data?.config?.telegramChatId ? 'bg-pulse-accent' : 'bg-pulse-muted/30'}`} />
          <span className="text-sm text-pulse-muted">
            {data?.config?.telegramChatId ? 'Telegram connected' : 'Telegram not connected'}
          </span>
        </div>
      </motion.div>

      <button
        onClick={handleSave}
        disabled={updateConfig.isPending || !hasUnsavedChanges}
        className="w-full py-3 rounded-xl bg-pulse-accent text-pulse-bg font-bold text-sm hover:bg-pulse-accent/90 transition-colors disabled:opacity-50"
      >
        {updateConfig.isPending ? 'Saving...' : 'Save Settings'}
      </button>

      {hasUnsavedChanges && !updateConfig.isPending && (
        <p className="text-center text-xs text-pulse-warning">
          You have unsaved changes.
        </p>
      )}

      {updateConfig.isSuccess && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-sm text-pulse-accent">
          Settings saved successfully.
        </motion.p>
      )}
    </div>
  )
}

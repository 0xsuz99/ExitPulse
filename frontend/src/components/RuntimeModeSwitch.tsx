import { Rocket, Wallet, CircleDot } from 'lucide-react'
import { useUpdateConfig, useUserConfig } from '../hooks/useApi'

export default function RuntimeModeSwitch() {
  const { data } = useUserConfig()
  const updateConfig = useUpdateConfig()

  const runtimeMode = data?.config?.runtimeMode || 'demo'
  const isSaving = updateConfig.isPending

  function switchRuntimeMode(mode: 'demo' | 'live') {
    if (mode === runtimeMode) return
    updateConfig.mutate({ runtimeMode: mode })
  }

  return (
    <div className="glass-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-white text-base font-bold">Experience Mode</h3>
          <p className="text-pulse-muted text-xs mt-1">
            Start with instant demo flow, then switch to live wallet execution anytime.
          </p>
        </div>
        <span className={`text-[10px] px-2 py-1 rounded-full border font-semibold ${
          runtimeMode === 'demo'
            ? 'text-pulse-warning border-pulse-warning/40 bg-pulse-warning/10'
            : 'text-pulse-accent border-pulse-accent/40 bg-pulse-accent/10'
        }`}>
          {runtimeMode === 'demo' ? 'DEMO ACTIVE' : 'REAL ACTIVE'}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={() => switchRuntimeMode('demo')}
          disabled={isSaving}
          className={`p-3 rounded-xl border text-left transition-colors ${
            runtimeMode === 'demo'
              ? 'border-pulse-warning/50 bg-pulse-warning/10'
              : 'border-pulse-border hover:border-pulse-warning/40'
          } disabled:opacity-60`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <Rocket className="w-4 h-4 text-pulse-warning" />
            <span className="text-sm font-semibold text-white">Demo</span>
          </div>
          <p className="text-xs text-pulse-muted">
            Runs simulated smart-money exits with an instant visible signal feed.
          </p>
        </button>

        <button
          onClick={() => switchRuntimeMode('live')}
          disabled={isSaving}
          className={`p-3 rounded-xl border text-left transition-colors ${
            runtimeMode === 'live'
              ? 'border-pulse-accent/50 bg-pulse-accent/10'
              : 'border-pulse-border hover:border-pulse-accent/40'
          } disabled:opacity-60`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <Wallet className="w-4 h-4 text-pulse-accent" />
            <span className="text-sm font-semibold text-white">Live</span>
          </div>
          <p className="text-xs text-pulse-muted">
            Uses connected wallet holdings and disables simulated exits.
          </p>
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-pulse-muted">
        <CircleDot className="w-3.5 h-3.5" />
        <span>{isSaving ? 'Switching mode...' : 'Live mode uses connected wallet + delegate execution.'}</span>
      </div>
    </div>
  )
}

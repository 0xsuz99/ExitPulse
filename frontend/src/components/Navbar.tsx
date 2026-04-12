import { Activity, Settings, BookOpen, LayoutDashboard } from 'lucide-react'
import ConnectWallet from './ConnectWallet'
import { useUpdateConfig, useUserConfig } from '../hooks/useApi'

interface NavbarProps {
  activeTab: string
  onTabChange: (tab: any) => void
  signalCount: number
}

export default function Navbar({ activeTab, onTabChange, signalCount }: NavbarProps) {
  const { data: configData } = useUserConfig()
  const updateConfig = useUpdateConfig()
  const runtimeMode = configData?.config?.runtimeMode || 'demo'

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'how-it-works', label: 'How It Works', icon: BookOpen },
    { id: 'settings', label: 'Settings', icon: Settings },
  ]

  function switchRuntimeMode(mode: 'demo' | 'live') {
    if (mode === runtimeMode) return
    updateConfig.mutate({ runtimeMode: mode })
  }

  return (
    <nav className="sticky top-0 z-50 bg-pulse-bg/80 backdrop-blur-xl border-b border-pulse-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <Activity className="w-7 h-7 text-pulse-accent" />
              <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-pulse-accent rounded-full animate-pulse" />
            </div>
            <span className="text-xl font-bold tracking-tight">
              <span className="text-gradient">Exit</span>
              <span className="text-white">Pulse</span>
            </span>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-pulse-accent/10 text-pulse-accent'
                    : 'text-pulse-muted hover:text-white hover:bg-white/5'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Right side: signals, wallet */}
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-lg border border-pulse-border bg-pulse-bg p-0.5">
              <button
                onClick={() => switchRuntimeMode('demo')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded ${
                  runtimeMode === 'demo'
                    ? 'bg-pulse-warning/15 text-pulse-warning'
                    : 'text-pulse-muted hover:text-white'
                }`}
              >
                Demo
              </button>
              <button
                onClick={() => switchRuntimeMode('live')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded ${
                  runtimeMode === 'live'
                    ? 'bg-pulse-accent/15 text-pulse-accent'
                    : 'text-pulse-muted hover:text-white'
                }`}
              >
                Live
              </button>
            </div>

            {signalCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-pulse-danger/10 border border-pulse-danger/20">
                <div className="w-2 h-2 bg-pulse-danger rounded-full animate-pulse" />
                <span className="text-xs font-medium text-pulse-danger">{signalCount} signals</span>
              </div>
            )}
            <ConnectWallet />
          </div>
        </div>
      </div>
    </nav>
  )
}

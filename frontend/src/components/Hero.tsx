import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Shield, Zap } from 'lucide-react'

interface HeroProps {
  latestSignal: any | null
}

export default function Hero({ latestSignal }: HeroProps) {
  const severityConfig = {
    low: { color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20', label: 'LOW' },
    medium: { color: 'text-pulse-warning', bg: 'bg-pulse-warning/10', border: 'border-pulse-warning/20', label: 'MEDIUM' },
    high: { color: 'text-pulse-danger', bg: 'bg-pulse-danger/10', border: 'border-pulse-danger/20', label: 'HIGH' },
    critical: { color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20', label: 'CRITICAL' },
  }

  return (
    <div className="relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-pulse-accent/5 via-transparent to-transparent" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-pulse-accent/5 rounded-full blur-[120px]" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="text-center mb-6">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-3">
            <span className="text-gradient">Smart Money</span>{' '}
            <span className="text-white">Exit Detection</span>
          </h1>
          <p className="text-pulse-muted text-lg max-w-2xl mx-auto">
            Real-time monitoring of top wallet exits. Get notified before it's too late.
            Auto-execute in delegate mode, or manually sign exits from your wallet.
          </p>
        </div>

        {/* Latest Signal Banner */}
        <AnimatePresence mode="wait">
          {latestSignal ? (
            <motion.div
              key={latestSignal.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className={`max-w-2xl mx-auto glass-card p-4 ${
                latestSignal.severity === 'critical' || latestSignal.severity === 'high'
                  ? 'glow-red border-pulse-danger/30'
                  : 'glow-orange border-pulse-warning/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${severityConfig[latestSignal.severity as keyof typeof severityConfig]?.bg}`}>
                    <AlertTriangle className={`w-5 h-5 ${severityConfig[latestSignal.severity as keyof typeof severityConfig]?.color}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{latestSignal.tokenSymbol}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${severityConfig[latestSignal.severity as keyof typeof severityConfig]?.bg} ${severityConfig[latestSignal.severity as keyof typeof severityConfig]?.color}`}>
                        CES {latestSignal.score}
                      </span>
                    </div>
                    <p className="text-sm text-pulse-muted">
                      {latestSignal.exits?.length || 0} smart wallet(s) exiting - You hold ${latestSignal.userHolding?.balanceUsd?.toFixed(0) || '0'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${severityConfig[latestSignal.severity as keyof typeof severityConfig]?.color}`}>
                    {severityConfig[latestSignal.severity as keyof typeof severityConfig]?.label}
                  </span>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-2xl mx-auto glass-card p-4 glow-green border-pulse-accent/20"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-pulse-accent/10">
                  <Shield className="w-5 h-5 text-pulse-accent" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">All Clear</span>
                    <Zap className="w-4 h-4 text-pulse-accent" />
                  </div>
                  <p className="text-sm text-pulse-muted">
                    Monitoring active - No exit signals detected yet
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}


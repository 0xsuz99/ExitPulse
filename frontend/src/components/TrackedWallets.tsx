import { useTrackedWallets } from '../hooks/useApi'
import { motion } from 'framer-motion'
import { Eye, Trophy } from 'lucide-react'

export default function TrackedWallets() {
  const { data, isLoading } = useTrackedWallets()
  const wallets = data?.wallets || []

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Eye className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-bold text-white">Tracked Wallets</h2>
        </div>
        <div className="text-right">
          <span className="text-xs text-pulse-muted font-mono block">{wallets.length} wallets</span>
          <span className="text-[10px] text-pulse-muted">configurable in Settings</span>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse h-12 rounded-lg bg-pulse-border/30" />
          ))}
        </div>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {wallets.map((wallet: any, i: number) => (
            <motion.div
              key={wallet.address}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/3 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${
                  wallet.pnlRank <= 3
                    ? 'bg-yellow-400/10 border-yellow-400/30'
                    : wallet.pnlRank <= 10
                    ? 'bg-purple-400/10 border-purple-400/30'
                    : 'bg-pulse-border/50 border-pulse-border'
                }`}>
                  {wallet.pnlRank <= 3 ? (
                    <Trophy className={`w-3.5 h-3.5 ${
                      wallet.pnlRank === 1 ? 'text-yellow-400' : wallet.pnlRank === 2 ? 'text-gray-300' : 'text-amber-600'
                    }`} />
                  ) : (
                    <span className="text-xs font-bold text-pulse-muted">#{wallet.pnlRank}</span>
                  )}
                </div>
                <div>
                  <div className="text-sm font-medium text-white">
                    {wallet.label || `Wallet #${wallet.pnlRank}`}
                  </div>
                  <div className="text-xs text-pulse-muted font-mono">
                    {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs font-semibold text-pulse-accent">
                  ${(wallet.totalPnl / 1000).toFixed(0)}K
                </div>
                <div className="text-xs text-pulse-muted">
                  {(wallet.winRate * 100).toFixed(0)}% win
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

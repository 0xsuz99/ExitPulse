import { useHoldings, useUserConfig } from '../hooks/useApi'
import { motion } from 'framer-motion'
import { Wallet, TrendingUp, TrendingDown } from 'lucide-react'

export default function Holdings() {
  const { data, isLoading } = useHoldings()
  const { data: configData } = useUserConfig()
  const holdings = data?.holdings || []
  const runtimeMode = configData?.config?.runtimeMode || 'demo'
  const demoHoldings = configData?.demoHoldings

  const totalUsd = holdings.reduce((sum: number, h: any) => sum + h.balanceUsd, 0)

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-bold text-white">Your Holdings</h2>
        </div>
        <div className="text-right">
          <span className="text-sm font-bold text-white">${totalUsd.toLocaleString()}</span>
          {runtimeMode === 'demo' && demoHoldings && (
            <div className="text-[10px] text-pulse-warning font-semibold">DEMO</div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-pulse-border" />
                <div className="h-4 w-16 rounded bg-pulse-border" />
              </div>
              <div className="h-4 w-12 rounded bg-pulse-border" />
            </div>
          ))}
        </div>
      ) : holdings.length > 0 ? (
        <div className="space-y-2">
          {holdings.map((holding: any, i: number) => (
            <motion.div
              key={holding.tokenAddress}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/3 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pulse-accent/20 to-blue-400/20 flex items-center justify-center border border-pulse-border">
                  <span className="text-xs font-bold text-white">
                    {holding.tokenSymbol?.slice(0, 2)}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-white text-sm">{holding.tokenSymbol}</span>
                  <div className="text-xs text-pulse-muted">{holding.chain?.toUpperCase()}</div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-sm font-semibold text-white">
                  ${holding.balanceUsd?.toFixed(0)}
                </div>
                <div className={`flex items-center justify-end gap-0.5 text-xs font-medium ${
                  holding.pnlPercent >= 0 ? 'text-pulse-accent' : 'text-pulse-danger'
                }`}>
                  {holding.pnlPercent >= 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {holding.pnlPercent >= 0 ? '+' : ''}{holding.pnlPercent?.toFixed(1)}%
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-pulse-border bg-pulse-bg p-3">
          <p className="text-xs text-pulse-muted">
            {runtimeMode === 'live'
              ? 'No live holdings found yet. Connect a wallet to sync native balance.'
              : 'Demo holdings are not available right now.'}
          </p>
        </div>
      )}
    </div>
  )
}

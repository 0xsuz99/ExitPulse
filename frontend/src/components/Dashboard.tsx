import { useStats } from '../hooks/useApi'
import { motion } from 'framer-motion'
import { Activity, AlertTriangle, Eye, Wallet, DollarSign, TrendingDown } from 'lucide-react'

export default function Dashboard() {
  const { data, isLoading } = useStats()
  const stats = data || {}

  const cards = [
    {
      label: 'Tracked Wallets',
      value: stats.trackedWallets ?? '--',
      icon: Eye,
      color: 'text-pulse-accent',
      bg: 'bg-pulse-accent/10',
    },
    {
      label: 'Signals (1h)',
      value: stats.signalsLastHour ?? '--',
      icon: Activity,
      color: 'text-pulse-warning',
      bg: 'bg-pulse-warning/10',
    },
    {
      label: 'Critical Alerts',
      value: stats.criticalSignals ?? '--',
      icon: AlertTriangle,
      color: 'text-pulse-danger',
      bg: 'bg-pulse-danger/10',
    },
    {
      label: 'Holdings',
      value: stats.holdingsCount ?? '--',
      icon: Wallet,
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
    },
    {
      label: 'Portfolio Value',
      value: stats.totalPortfolioUsd ? `$${stats.totalPortfolioUsd.toLocaleString()}` : '--',
      icon: DollarSign,
      color: 'text-emerald-400',
      bg: 'bg-emerald-400/10',
    },
    {
      label: 'Total Signals',
      value: stats.totalSignals ?? '--',
      icon: TrendingDown,
      color: 'text-purple-400',
      bg: 'bg-purple-400/10',
    },
    {
      label: 'Runtime',
      value: stats.runtimeMode ? String(stats.runtimeMode).toUpperCase() : '--',
      icon: Activity,
      color: stats.runtimeMode === 'demo' ? 'text-pulse-warning' : 'text-pulse-accent',
      bg: stats.runtimeMode === 'demo' ? 'bg-pulse-warning/10' : 'bg-pulse-accent/10',
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
      {cards.map((card, i) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="glass-card p-4 hover:border-pulse-accent/20 transition-colors"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className={`p-1.5 rounded-md ${card.bg}`}>
              <card.icon className={`w-3.5 h-3.5 ${card.color}`} />
            </div>
            <span className="text-xs text-pulse-muted font-medium">{card.label}</span>
          </div>
          <div className={`text-2xl font-bold ${isLoading ? 'animate-pulse text-pulse-muted' : 'text-white'}`}>
            {card.value}
          </div>
        </motion.div>
      ))}
    </div>
  )
}

import { motion } from 'framer-motion'
import {
  Activity, Eye, Brain, Bell, Zap, Shield,
  ArrowDown, CheckCircle, Code
} from 'lucide-react'

export default function HowItWorks() {
  return (
    <div className="space-y-16">
      {/* Header */}
      <div className="text-center">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-extrabold text-white mb-4"
        >
          How <span className="text-gradient">ExitPulse</span> Works
        </motion.h1>
        <p className="text-pulse-muted text-lg max-w-2xl mx-auto">
          ExitPulse monitors top-performing wallets in real time and alerts you when they start
          exiting tokens you hold - so you can exit safely before the crowd.
        </p>
      </div>

      {/* Flow Diagram */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white text-center mb-8">Signal Flow</h2>
        {[
          {
            icon: Eye,
            title: 'Monitor Smart Wallets',
            desc: 'We track the top 50+ wallets ranked by historical PnL via Ave Data API. Their every trade is monitored in real-time.',
            color: 'text-purple-400',
            bg: 'bg-purple-400/10',
          },
          {
            icon: Activity,
            title: 'Detect Exit Transactions',
            desc: 'When a tracked wallet sells a token, our WebSocket stream picks it up instantly - not from block explorers, from Ave\'s direct feed.',
            color: 'text-blue-400',
            bg: 'bg-blue-400/10',
          },
          {
            icon: Brain,
            title: 'Calculate Consensus Exit Score',
            desc: 'Each exit is scored using our CES algorithm (details below). Multiple exits on the same token compound the score.',
            color: 'text-pulse-warning',
            bg: 'bg-pulse-warning/10',
          },
          {
            icon: Bell,
            title: 'Notify via Telegram',
            desc: 'If CES crosses your threshold and you hold the token, you get an instant Telegram alert. In auto mode, non-critical alerts can be approved directly.',
            color: 'text-pulse-accent',
            bg: 'bg-pulse-accent/10',
          },
          {
            icon: Zap,
            title: 'Execute Exit',
            desc: 'Manual mode executes from dashboard signatures. Auto mode executes critical exits via delegate wallet.',
            color: 'text-pulse-danger',
            bg: 'bg-pulse-danger/10',
          },
        ].map((step, i) => (
          <div key={i}>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="glass-card p-5 flex items-start gap-4"
            >
              <div className={`p-3 rounded-xl ${step.bg} shrink-0`}>
                <step.icon className={`w-6 h-6 ${step.color}`} />
              </div>
              <div>
                <h3 className="font-bold text-white text-lg">{step.title}</h3>
                <p className="text-pulse-muted text-sm mt-1">{step.desc}</p>
              </div>
              <div className="ml-auto text-pulse-muted/30 font-mono text-2xl font-bold shrink-0">
                {String(i + 1).padStart(2, '0')}
              </div>
            </motion.div>
            {i < 4 && (
              <div className="flex justify-center py-1">
                <ArrowDown className="w-5 h-5 text-pulse-border" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* CES Algorithm */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-card p-8"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-pulse-warning/10">
            <Brain className="w-6 h-6 text-pulse-warning" />
          </div>
          <h2 className="text-2xl font-bold text-white">Consensus Exit Score (CES)</h2>
        </div>

        <p className="text-pulse-muted mb-6">
          CES isn't just a simple exit count. It weights each exit by who's selling, how much they're selling,
          and how long they've held. A rank #1 wallet dumping a 60-day position scores far higher than a
          rank #80 wallet trimming 10%.
        </p>

        <div className="bg-pulse-bg rounded-xl p-6 font-mono text-sm border border-pulse-border mb-6">
          <div className="text-pulse-muted mb-3">// For each smart wallet exit in a 15-min window:</div>
          <div className="text-white space-y-2">
            <div>
              <span className="text-purple-400">wallet_weight</span>{' = '}
              <span className="text-pulse-accent">1 - (pnl_rank / total_tracked)</span>
            </div>
            <div>
              <span className="text-purple-400">exit_ratio</span>{' = '}
              <span className="text-pulse-accent">amount_sold / total_position</span>
            </div>
            <div>
              <span className="text-purple-400">hold_factor</span>{' = '}
              <span className="text-pulse-accent">log10(days_held + 1) + 1</span>
            </div>
            <div className="pt-2 border-t border-pulse-border mt-2">
              <span className="text-pulse-warning">per_exit_score</span>{' = '}
              <span className="text-white">wallet_weight x exit_ratio x hold_factor</span>
            </div>
            <div className="pt-2">
              <span className="text-pulse-danger font-bold">CES</span>{' = '}
              <span className="text-white">sum of per_exit_score (all exits in window)</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              label: 'wallet_weight',
              desc: 'Rank #1 wallet = 1.0 weight. Rank #50 of 50 = 0.0. Higher-performing wallets carry more signal.',
              color: 'text-purple-400',
            },
            {
              label: 'exit_ratio',
              desc: 'Full position exit (100%) = 1.0. A 20% trim = 0.2. We ignore exits below 10% as noise.',
              color: 'text-blue-400',
            },
            {
              label: 'hold_factor',
              desc: 'A wallet holding 60 days then exiting = 2.78x multiplier. Day-trader exits get only 1.0x.',
              color: 'text-pulse-accent',
            },
          ].map((factor) => (
            <div key={factor.label} className="bg-pulse-bg rounded-lg p-4 border border-pulse-border">
              <span className={`font-mono font-bold text-sm ${factor.color}`}>{factor.label}</span>
              <p className="text-xs text-pulse-muted mt-2">{factor.desc}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Thresholds */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="glass-card p-8"
      >
        <h2 className="text-xl font-bold text-white mb-6">Signal Thresholds</h2>
        <div className="space-y-3">
          {[
            { score: '1.5+', severity: 'Medium', action: 'Notify + action prompt (dashboard, or Telegram approval in auto mode)', color: 'bg-pulse-warning', textColor: 'text-pulse-warning' },
            { score: '3.0+', severity: 'High', action: 'High-risk escalation + approval flow', color: 'bg-pulse-danger', textColor: 'text-pulse-danger' },
            { score: '5.0+', severity: 'Critical', action: 'Auto-exit in auto mode, otherwise urgent manual action', color: 'bg-red-500', textColor: 'text-red-400' },
          ].map((t) => (
            <div key={t.score} className="flex items-center gap-4 p-3 rounded-lg bg-pulse-bg border border-pulse-border">
              <div className={`w-3 h-3 rounded-full ${t.color}`} />
              <span className={`font-mono font-bold text-sm w-16 ${t.textColor}`}>{'>'} {t.score}</span>
              <span className="text-sm text-pulse-muted flex-1">{t.action}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Tech Stack */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="glass-card p-8"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-blue-400/10">
            <Code className="w-6 h-6 text-blue-400" />
          </div>
          <h2 className="text-xl font-bold text-white">Built With</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { name: 'Ave Data API', desc: 'Smart wallet rankings & analytics' },
            { name: 'Ave Trade API', desc: 'On-chain swap execution' },
            { name: 'Ave WebSocket', desc: 'Real-time transaction streams' },
            { name: 'Telegram Bot', desc: 'Mobile notifications & command controls' },
            { name: 'Node.js + TS', desc: 'Backend signal engine' },
            { name: 'React + Tailwind', desc: 'Real-time dashboard' },
            { name: 'CES Algorithm', desc: 'Weighted exit scoring' },
            { name: 'BSC / Solana', desc: 'Multi-chain support' },
          ].map((tech) => (
            <div key={tech.name} className="p-3 rounded-lg bg-pulse-bg border border-pulse-border">
              <div className="text-sm font-semibold text-white">{tech.name}</div>
              <div className="text-xs text-pulse-muted mt-1">{tech.desc}</div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Safety */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="glass-card p-8 glow-green border-pulse-accent/20"
      >
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-6 h-6 text-pulse-accent" />
          <h2 className="text-xl font-bold text-white">Safety First</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            'Manual mode requires explicit dashboard signature in both demo and live modes',
            'Chain Wallet mode means Ave never holds your private keys',
            'Configurable thresholds - you control when signals fire',
            'All transactions are visible on-chain and auditable via block explorer',
          ].map((point, i) => (
            <div key={i} className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-pulse-accent mt-0.5 shrink-0" />
              <span className="text-sm text-pulse-muted">{point}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

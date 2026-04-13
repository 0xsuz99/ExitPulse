import { motion } from 'framer-motion'
import { useState } from 'react'
import { AlertTriangle, TrendingDown, Clock, ExternalLink, CheckCircle, XCircle, Activity, Zap, Loader2, Ban } from 'lucide-react'
import { useExecuteExit, useBuildExitTx, useSimulateExit, useDismissSignal, useRecordManualExit, useUserConfig } from '../hooks/useApi'
import { useAccount, useSendTransaction, useSignMessage } from 'wagmi'

interface SignalFeedProps {
  signals: any[]
  onDismissSignal?: (signalId: string, dismissed: boolean) => void
}

export default function SignalFeed({ signals, onDismissSignal }: SignalFeedProps) {
  const executeExit = useExecuteExit()
  const simulateExit = useSimulateExit()
  const dismissSignal = useDismissSignal()
  const recordManualExit = useRecordManualExit()
  const buildExitTx = useBuildExitTx()
  const { data: userConfigData } = useUserConfig()
  const { isConnected } = useAccount()
  const { sendTransactionAsync } = useSendTransaction()
  const { signMessageAsync } = useSignMessage()
  const [actionState, setActionState] = useState<Record<string, { type: 'success' | 'error' | 'pending'; message: string }>>({})
  const runtimeMode = userConfigData?.config?.runtimeMode || 'demo'
  const exitMode = userConfigData?.config?.mode || 'manual'
  const hasDelegateWallet = Boolean(userConfigData?.config?.assetsId)
  const hasBackendWallet = Boolean(userConfigData?.config?.walletAddress)
  const hasConnectedWallet = Boolean(isConnected)
  const autoModeNotice = runtimeMode === 'live'
    ? (hasDelegateWallet
      ? 'Critical signals are auto-executed via delegate wallet.'
      : 'Critical signals will auto-exit after delegate wallet is configured.')
    : 'Critical signals are auto-executed in simulation.'

  const severityConfig = {
    low: { color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20', glow: '' },
    medium: { color: 'text-pulse-warning', bg: 'bg-pulse-warning/10', border: 'border-pulse-warning/20', glow: '' },
    high: { color: 'text-pulse-danger', bg: 'bg-pulse-danger/10', border: 'border-pulse-danger/20', glow: 'glow-red' },
    critical: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', glow: 'glow-red' },
  }

  function timeAgo(ts: number) {
    const diff = Math.floor((Date.now() - ts) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return `${Math.floor(diff / 3600)}h ago`
  }

  function getExplorerTxUrl(chain: string, txHash: string) {
    const normalized = (chain || '').toLowerCase()
    if (normalized === 'bsc') return `https://bscscan.com/tx/${txHash}`
    if (normalized === 'eth') return `https://etherscan.io/tx/${txHash}`
    if (normalized === 'base') return `https://basescan.org/tx/${txHash}`
    if (normalized === 'solana') return `https://solscan.io/tx/${txHash}`
    return null
  }

  async function handleDemoExit(signal: any) {
    const signalId = signal.id
    setActionState(prev => ({ ...prev, [signalId]: { type: 'pending', message: hasConnectedWallet ? 'Requesting wallet signature...' : 'Simulating exit...' } }))

    if (hasConnectedWallet) {
      try {
        await signMessageAsync({
          message: [
            'ExitPulse Demo Approval',
            `Signal: ${signalId}`,
            `Token: ${signal.tokenSymbol}`,
            `Mode: ${runtimeMode.toUpperCase()}-${exitMode.toUpperCase()}`,
            `Timestamp: ${new Date().toISOString()}`,
          ].join('\n'),
        })
      } catch (walletErr: any) {
        const msg = walletErr?.shortMessage || walletErr?.message || 'Wallet signature rejected'
        setActionState(prev => ({ ...prev, [signalId]: { type: 'error', message: msg } }))
        return
      }
    }

    try {
      const result = await simulateExit.mutateAsync({
        signalId,
        tokenAddress: signal.tokenAddress,
        chain: signal.chain,
      })
      if (result?.success) {
        setActionState(prev => ({
          ...prev,
          [signalId]: {
            type: 'success',
            message: hasConnectedWallet
              ? `Wallet signed. Demo exit simulated: ${(result?.txHash || '').slice(0, 12)}...`
              : `Demo exit simulated: ${(result?.txHash || '').slice(0, 12)}...`,
          },
        }))
      } else {
        setActionState(prev => ({ ...prev, [signalId]: { type: 'error', message: result?.error || 'Simulation failed' } }))
      }
    } catch (err: any) {
      setActionState(prev => ({ ...prev, [signalId]: { type: 'error', message: err?.message || 'Simulation failed' } }))
    }
  }

  async function handleChainWalletExit(signalId: string) {
    setActionState(prev => ({ ...prev, [signalId]: { type: 'pending', message: 'Building transaction...' } }))
    try {
      const result = await buildExitTx.mutateAsync(signalId)
      if (!result.success) {
        setActionState(prev => ({ ...prev, [signalId]: { type: 'error', message: result.error || 'Failed to build tx' } }))
        return
      }

      setActionState(prev => ({ ...prev, [signalId]: { type: 'pending', message: 'Confirm in MetaMask...' } }))

      try {
        const txHash = await sendTransactionAsync({
          to: result.tx.to as `0x${string}`,
          data: result.tx.data as `0x${string}`,
          value: BigInt(result.tx.value || '0'),
        })
        await recordManualExit.mutateAsync({ signalId, txHash })
        setActionState(prev => ({ ...prev, [signalId]: { type: 'success', message: `Tx sent: ${txHash.slice(0, 10)}...` } }))
      } catch (walletErr: any) {
        const msg = walletErr?.shortMessage || walletErr?.message || 'Transaction rejected'
        setActionState(prev => ({ ...prev, [signalId]: { type: 'error', message: msg } }))
      }
    } catch (err: any) {
      setActionState(prev => ({ ...prev, [signalId]: { type: 'error', message: err?.message || 'Failed to build exit tx' } }))
    }
  }

  async function handleDelegateExit(signalId: string) {
    setActionState(prev => ({ ...prev, [signalId]: { type: 'pending', message: 'Executing via delegate wallet...' } }))
    executeExit.mutate(signalId, {
      onSuccess: (result: any) => {
        if (result?.success) {
          setActionState(prev => ({ ...prev, [signalId]: { type: 'success', message: `Exit submitted. Tx: ${result.txHash || 'pending'}` } }))
        } else {
          setActionState(prev => ({ ...prev, [signalId]: { type: 'error', message: result?.error || 'Exit failed.' } }))
        }
      },
      onError: (err: any) => {
        setActionState(prev => ({ ...prev, [signalId]: { type: 'error', message: err?.message || 'Exit failed.' } }))
      },
    })
  }

  function handleDismiss(signalId: string) {
    onDismissSignal?.(signalId, true)
    dismissSignal.mutate(signalId, {
      onError: (err: any) => {
        const msg = (err?.message || '').toLowerCase()
        // If backend no longer has this signal, keep it dismissed in UI.
        if (msg.includes('signal not found')) return
        onDismissSignal?.(signalId, false)
      },
    })
  }

  function getSignalTxHash(signal: any): string | null {
    return signal?.executionTxHash || signal?.exits?.[0]?.txHash || null
  }

  function getExecutionBadge(signal: any) {
    const status = signal.executionStatus
    if (!status) return null
    const source = signal.executionSource as string | undefined

    if (status === 'executing') {
      return (
        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-pulse-warning/10 text-pulse-warning font-semibold">
          <Loader2 className="w-3 h-3 animate-spin" />
          PROCESSING
        </span>
      )
    }
    if (status === 'executed') {
      const label = source === 'telegram'
        ? 'TELEGRAM-APPROVED'
        : source === 'dashboard'
          ? 'WALLET-SIGNED'
          : source === 'auto'
            ? 'AUTO-EXITED'
            : source === 'delegate'
              ? 'DELEGATE-EXECUTED'
              : 'EXECUTED'
      return (
        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-pulse-accent/10 text-pulse-accent font-semibold">
          <CheckCircle className="w-3 h-3" />
          {label}
        </span>
      )
    }
    if (status === 'failed') {
      return (
        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-pulse-danger/10 text-pulse-danger font-semibold">
          <Ban className="w-3 h-3" />
          FAILED
        </span>
      )
    }
    return null
  }

  function getActionBadge(signal: any) {
    if (signal.action === 'auto_exit' && exitMode === 'auto') {
      return (
        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 font-semibold">
          <Zap className="w-3 h-3" />
          AUTO-EXIT
        </span>
      )
    }
    return null
  }

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-pulse-warning" />
          <h2 className="text-lg font-bold text-white">Signal Feed</h2>
        </div>
        <span className="text-xs text-pulse-muted font-mono">
          {signals.length} signal{signals.length !== 1 ? 's' : ''}
        </span>
      </div>

      {exitMode === 'auto' && (
        <div className="mb-4 rounded-lg border border-pulse-danger/20 bg-pulse-danger/5 px-3 py-2 text-xs text-pulse-muted">
          <span className="font-semibold text-pulse-danger">Auto Mode Active:</span>{' '}
          {autoModeNotice}
        </div>
      )}

      {signals.length === 0 ? (
        <div className="text-center py-16">
          <Activity className="w-12 h-12 text-pulse-muted/30 mx-auto mb-3" />
          <p className="text-pulse-muted text-sm">
            {runtimeMode === 'live' ? 'Live monitoring active. Waiting for smart-wallet exits...' : 'Waiting for demo signals...'}
          </p>
          <p className="text-pulse-muted/50 text-xs mt-1">
            {runtimeMode === 'live'
              ? 'Live engine waits for tracked-wallet exits that overlap your watchlist.'
              : 'Signals appear when simulated smart wallets exit tokens you hold.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
          {signals.map((signal, i) => {
            const cfg = severityConfig[signal.severity as keyof typeof severityConfig] || severityConfig.low
            const state = actionState[signal.id]
            const isAutoExecuted = signal.executionStatus === 'executed' || signal.executionStatus === 'executing'
            const isBusy = state?.type === 'pending'
            const shouldShowActionButtons = true
            const canUseDelegate =
              runtimeMode === 'live' &&
              exitMode === 'auto' &&
              signal.action === 'auto_exit' &&
              hasDelegateWallet
            const signalTxHash = getSignalTxHash(signal)
            const signalTxUrl = signalTxHash ? getExplorerTxUrl(signal.chain, signalTxHash) : null

            return (
              <motion.div
                key={`${signal.id}_${i}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`rounded-lg border p-4 ${cfg.border} ${cfg.glow} bg-pulse-bg/50`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${cfg.bg}`}>
                      <TrendingDown className={`w-4 h-4 ${cfg.color}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-lg">{signal.tokenSymbol}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${cfg.bg} ${cfg.color}`}>
                          CES {signal.score}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold uppercase ${cfg.bg} ${cfg.color}`}>
                          {signal.severity}
                        </span>
                        {getActionBadge(signal)}
                        {getExecutionBadge(signal)}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-pulse-muted">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {timeAgo(signal.timestamp)}
                        </span>
                        <span>{signal.chain?.toUpperCase()}</span>
                        <span>{signal.exits?.length || 0} exits</span>
                      </div>
                    </div>
                  </div>

                  {signal.userHolding && (
                    <div className="text-right">
                      <div className="text-sm font-bold text-white">
                        ${signal.userHolding.balanceUsd?.toFixed(0)}
                      </div>
                      <div className={`text-xs font-medium ${
                        signal.userHolding.pnlPercent >= 0 ? 'text-pulse-accent' : 'text-pulse-danger'
                      }`}>
                        {signal.userHolding.pnlPercent >= 0 ? '+' : ''}{signal.userHolding.pnlPercent?.toFixed(1)}%
                      </div>
                    </div>
                  )}
                </div>

                {/* Execution result inline for auto-exited signals */}
                {signal.executionStatus === 'failed' && signal.executionError && (
                  <div className="mb-3 px-3 py-2 rounded-lg bg-pulse-danger/5 border border-pulse-danger/10 text-xs text-pulse-danger">
                    {signal.executionError}
                  </div>
                )}
                {signal.executionStatus === 'executed' && signal.executionTxHash && (
                  <div className="mb-3 px-3 py-2 rounded-lg bg-pulse-accent/5 border border-pulse-accent/10 text-xs text-pulse-accent font-mono">
                    {runtimeMode === 'demo' ? 'Simulated Tx: ' : 'Tx: '}{signal.executionTxHash}
                  </div>
                )}

                {/* Exit details */}
                <div className="space-y-1.5 mb-3">
                  {signal.exits?.slice(0, 3).map((exit: any, j: number) => (
                    <div key={j} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-pulse-danger" />
                        <span className="text-pulse-muted font-mono">
                          Rank #{exit.pnlRank}
                        </span>
                        <span className="text-pulse-text">
                          exited {(exit.exitRatio * 100).toFixed(0)}%
                        </span>
                      </div>
                      <span className="text-pulse-muted">
                        held {exit.holdDurationDays}d
                      </span>
                    </div>
                  ))}
                  {(signal.exits?.length || 0) > 3 && (
                    <span className="text-xs text-pulse-muted">
                      +{signal.exits.length - 3} more exits
                    </span>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  {shouldShowActionButtons && !isAutoExecuted && (
                    <>
                      {/* In live auto mode, auto-exit signals can still be manually executed via delegate */}
                      {canUseDelegate ? (
                        <button
                          onClick={() => handleDelegateExit(signal.id)}
                          disabled={isBusy}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pulse-danger/10 border border-pulse-danger/20 text-pulse-danger text-xs font-semibold hover:bg-pulse-danger/20 transition-colors disabled:opacity-50"
                        >
                          {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                          {isBusy ? 'Executing...' : 'Execute Exit'}
                        </button>
                      ) : runtimeMode === 'demo' ? (
                        <button
                          onClick={() => handleDemoExit(signal)}
                          disabled={isBusy}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pulse-warning/10 border border-pulse-warning/20 text-pulse-warning text-xs font-semibold hover:bg-pulse-warning/20 transition-colors disabled:opacity-50"
                        >
                          {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                          {isBusy ? (state?.message || 'Processing...') : hasConnectedWallet ? 'Simulate + Sign' : 'Simulate Exit'}
                        </button>
                      ) : hasBackendWallet ? (
                        /* Any mode with wallet connected: chain wallet (MetaMask sign) */
                        <button
                          onClick={() => handleChainWalletExit(signal.id)}
                          disabled={isBusy}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pulse-danger/10 border border-pulse-danger/20 text-pulse-danger text-xs font-semibold hover:bg-pulse-danger/20 transition-colors disabled:opacity-50"
                        >
                          {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                          {isBusy ? (state?.message || 'Processing...') : 'Sign Exit in Wallet'}
                        </button>
                      ) : (
                        <button
                          disabled
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-pulse-muted text-xs font-semibold opacity-50"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Connect Wallet to Execute
                        </button>
                      )}
                    </>
                  )}
                  <button
                    onClick={() => handleDismiss(signal.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-pulse-muted text-xs font-medium hover:bg-white/10 transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Dismiss
                  </button>
                  {signalTxHash && signalTxUrl && (
                    <a
                      href={signalTxUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 ml-auto text-xs text-pulse-muted hover:text-pulse-accent transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {runtimeMode === 'demo' ? 'View Tx (Simulated)' : 'View Tx'}
                    </a>
                  )}
                  {signalTxHash && runtimeMode === 'demo' && !signalTxUrl && (
                    <span className="ml-auto text-[11px] text-pulse-muted font-mono">
                      Simulated Tx
                    </span>
                  )}
                </div>

                {state && state.type !== 'pending' && (
                  <p className={`mt-2 text-xs font-medium ${state.type === 'success' ? 'text-pulse-accent' : 'text-pulse-danger'}`}>
                    {state.message}
                  </p>
                )}
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

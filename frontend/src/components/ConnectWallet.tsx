import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi'
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { formatUnits } from 'viem'
import { Wallet, LogOut } from 'lucide-react'
import { useUserConfig } from '../hooks/useApi'

import { API_BASE, withSessionHeader } from '../config/api'

export default function ConnectWallet() {
  const { address, isConnected, chain } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { data: balance } = useBalance({ address })
  const { data: userConfigData } = useUserConfig()
  const runtimeMode = userConfigData?.config?.runtimeMode || 'demo'
  const formattedBalance = balance ? formatUnits(balance.value, balance.decimals) : null
  const queryClient = useQueryClient()
  const lastSyncedRef = useRef<string>('')
  const wasConnectedRef = useRef(false)

  // Notify backend when wallet connects
  useEffect(() => {
    if (isConnected && address && runtimeMode === 'live') {
      wasConnectedRef.current = true
      const syncKey = `${address}-${chain?.id || 'na'}-${balance?.value?.toString() || '0'}-${runtimeMode}`
      if (lastSyncedRef.current === syncKey) {
        return
      }
      lastSyncedRef.current = syncKey

      fetch(`${API_BASE}/connect-wallet`, {
        method: 'POST',
        headers: withSessionHeader({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          walletAddress: address,
          chain: chainIdToName(chain?.id),
          nativeBalance: balance ? {
            symbol: balance.symbol,
            balanceWei: balance.value.toString(),
            formatted: formattedBalance,
            decimals: balance.decimals,
          } : undefined,
        }),
      })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['config'] })
          queryClient.invalidateQueries({ queryKey: ['holdings'] })
          queryClient.invalidateQueries({ queryKey: ['stats'] })
          queryClient.invalidateQueries({ queryKey: ['signals'] })
        })
        .catch(() => {})
    }
  }, [isConnected, address, chain?.id, balance?.value, balance?.symbol, balance?.decimals, formattedBalance, runtimeMode, queryClient])

  // Clear backend wallet context when user disconnects wallet
  useEffect(() => {
    if (isConnected) {
      wasConnectedRef.current = true
      return
    }

    if (!wasConnectedRef.current) {
      return
    }

    wasConnectedRef.current = false
    lastSyncedRef.current = ''

    fetch(`${API_BASE}/disconnect-wallet`, {
      method: 'POST',
      headers: withSessionHeader(),
    })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['config'] })
        queryClient.invalidateQueries({ queryKey: ['holdings'] })
        queryClient.invalidateQueries({ queryKey: ['stats'] })
        queryClient.invalidateQueries({ queryKey: ['signals'] })
      })
      .catch(() => {})
  }, [isConnected, queryClient])

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-pulse-accent/10 border border-pulse-accent/20">
          <div className="w-2 h-2 rounded-full bg-pulse-accent" />
          <span className="text-xs font-mono text-pulse-accent">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
          {balance && (
            <span className="text-xs text-pulse-muted">
              {parseFloat(formattedBalance || '0').toFixed(4)} {balance.symbol}
            </span>
          )}
        </div>
        <button
          onClick={() => disconnect()}
          className="p-1.5 rounded-lg hover:bg-white/5 text-pulse-muted hover:text-white transition-colors"
          title="Disconnect"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => connect({ connector: connectors[0] })}
      disabled={isPending}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-pulse-accent text-pulse-bg text-sm font-semibold hover:bg-pulse-accent/90 transition-colors disabled:opacity-50"
    >
      <Wallet className="w-4 h-4" />
      {isPending ? 'Connecting...' : 'Connect Wallet'}
    </button>
  )
}

function chainIdToName(chainId?: number): string {
  switch (chainId) {
    case 56: return 'bsc'
    case 1: return 'eth'
    case 8453: return 'base'
    default: return 'bsc'
  }
}

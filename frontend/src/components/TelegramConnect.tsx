import { useEffect, useState, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Send, CheckCircle, ExternalLink, Copy, Check, Bot, KeyRound, Unplug, RotateCcw, Loader2 } from 'lucide-react'
import { useSetupTelegram, useUserConfig } from '../hooks/useApi'

import { API_BASE, withSessionHeader } from '../config/api'

export default function TelegramConnect() {
  const queryClient = useQueryClient()
  const { data } = useUserConfig()
  const setupTelegram = useSetupTelegram()

  const [linkCode, setLinkCode] = useState<string | null>(null)
  const [botUsername, setBotUsername] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [loadingLink, setLoadingLink] = useState(false)
  const [botTokenInput, setBotTokenInput] = useState('')
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [showTokenEditor, setShowTokenEditor] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const linked = Boolean(data?.config?.telegramChatId || data?.telegram?.linked)
  const configured = Boolean(data?.telegram?.configured)

  useEffect(() => {
    if (data?.telegram?.botUsername) {
      setBotUsername(data.telegram.botUsername)
    }
  }, [data?.telegram?.botUsername])

  // Auto-poll for connection after link code is generated
  useEffect(() => {
    if (linkCode && !linked) {
      pollRef.current = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ['config'] })
      }, 3000)
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [linkCode, linked, queryClient])

  // Clear link code once linked
  useEffect(() => {
    if (linked && linkCode) {
      setLinkCode(null)
      setActionMessage('Telegram connected successfully!')
    }
  }, [linked, linkCode])

  async function refreshConfig() {
    await queryClient.invalidateQueries({ queryKey: ['config'] })
  }

  async function generateLink() {
    setLoadingLink(true)
    setTokenError(null)
    try {
      const res = await fetch(`${API_BASE}/telegram-link`, {
        method: 'POST',
        headers: withSessionHeader(),
      })
      const result = await res.json()
      if (!res.ok) {
        throw new Error(result?.error || 'Failed to generate Telegram link')
      }
      setLinkCode(result.linkCode)
      setBotUsername(result.botUsername)
      setActionMessage('Link code generated. Send it to your bot with /start.')
    } catch (err: any) {
      setTokenError(err.message || 'Unable to generate link')
    }
    setLoadingLink(false)
  }

  function copyCode() {
    if (!linkCode) return
    navigator.clipboard.writeText(`/start ${linkCode}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function setupBotToken() {
    const cleaned = botTokenInput.trim()
    if (!cleaned) {
      setTokenError('Bot token is required')
      return
    }

    setTokenError(null)
    setupTelegram.mutate(cleaned, {
      onSuccess: (result: any) => {
        setBotUsername(result?.botUsername || null)
        setBotTokenInput('')
        setShowTokenEditor(false)
        setActionMessage('Telegram bot token saved.')
        refreshConfig()
      },
      onError: (err: any) => {
        setTokenError(err?.message || 'Unable to save bot token')
      },
    })
  }

  async function disconnectTelegramChat() {
    setTokenError(null)
    const res = await fetch(`${API_BASE}/telegram/disconnect`, {
      method: 'POST',
      headers: withSessionHeader(),
    })
    const payload = await res.json()
    if (!res.ok || payload?.success === false) {
      setTokenError(payload?.error || 'Failed to disconnect Telegram chat')
      return
    }
    setActionMessage('Telegram chat disconnected.')
    refreshConfig()
  }

  async function resetTelegramBot() {
    setTokenError(null)
    const res = await fetch(`${API_BASE}/telegram/reset`, {
      method: 'POST',
      headers: withSessionHeader(),
    })
    const payload = await res.json()
    if (!res.ok || payload?.success === false) {
      setTokenError(payload?.error || 'Failed to reset Telegram bot setup')
      return
    }
    setLinkCode(null)
    setBotUsername(null)
    setBotTokenInput('')
    setShowTokenEditor(false)
    setActionMessage('Telegram bot reset. You can configure a new bot token now.')
    refreshConfig()
  }

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${linked ? 'bg-pulse-accent/10' : 'bg-blue-400/10'}`}>
          <Send className={`w-5 h-5 ${linked ? 'text-pulse-accent' : 'text-blue-400'}`} />
        </div>
        <div>
          <h3 className="font-bold text-white">Connect Telegram</h3>
          <p className="text-xs text-pulse-muted">Manage alerts and action prompts directly from this dashboard.</p>
        </div>
      </div>

      {!configured || showTokenEditor ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-pulse-border bg-pulse-bg p-3 text-xs text-pulse-muted space-y-2">
            <p className="text-pulse-text font-semibold">Quick setup</p>
            <p>1. Create a bot in BotFather.</p>
            <p>2. Paste token below.</p>
            <p>3. Generate link code and send /start to your bot.</p>
          </div>

          <a
            href="https://t.me/BotFather"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-white/5 border border-pulse-border text-sm font-semibold text-white hover:bg-white/10 transition-colors"
          >
            <Bot className="w-4 h-4" />
            Open BotFather
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <div className="space-y-2">
            <label className="text-xs font-medium text-pulse-muted">Telegram Bot Token</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-pulse-muted" />
                <input
                  type="password"
                  value={botTokenInput}
                  onChange={(e) => setBotTokenInput(e.target.value)}
                  placeholder="123456:ABC..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-pulse-bg border border-pulse-border text-sm text-white placeholder:text-pulse-muted focus:outline-none focus:border-blue-400/60"
                />
              </div>
              <button
                onClick={setupBotToken}
                disabled={setupTelegram.isPending}
                className="px-3 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60"
              >
                {setupTelegram.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-pulse-accent/25 bg-pulse-accent/5 p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-white text-sm">
              {linked ? 'Telegram Connected' : 'Telegram Bot Ready'}
            </span>
            <CheckCircle className="w-4 h-4 text-pulse-accent" />
          </div>
          <p className="text-xs text-pulse-muted">
            {linked
              ? `Connected${botUsername ? ` to @${botUsername}` : ''}. You will receive signals and execution updates on Telegram.`
              : `Bot configured${botUsername ? ` (@${botUsername})` : ''}. Generate a link code to connect this chat.`}
          </p>
        </div>
      )}

      {configured && !linkCode && (
        <button
          onClick={generateLink}
          disabled={loadingLink}
          className="w-full py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-semibold hover:bg-blue-500/20 transition-colors disabled:opacity-50"
        >
          {loadingLink ? 'Generating...' : 'Generate Link Code'}
        </button>
      )}

      {configured && linkCode && (
        <div className="space-y-3">
          <div className="bg-pulse-bg rounded-lg p-3 border border-pulse-border">
            <p className="text-xs text-pulse-muted mb-2">Open your bot and send this command:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono text-white bg-pulse-border/30 px-3 py-1.5 rounded">
                /start {linkCode}
              </code>
              <button onClick={copyCode} className="p-1.5 rounded hover:bg-white/10 transition-colors">
                {copied ? (
                  <Check className="w-4 h-4 text-pulse-accent" />
                ) : (
                  <Copy className="w-4 h-4 text-pulse-muted" />
                )}
              </button>
            </div>
          </div>

          {botUsername && (
            <a
              href={`https://t.me/${botUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 transition-colors"
            >
              <Send className="w-4 h-4" />
              Open Bot in Telegram
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          <div className="flex items-center justify-center gap-2 py-2 text-xs text-pulse-muted">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Waiting for you to send /start to the bot...</span>
          </div>
        </div>
      )}

      {configured && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onClick={() => setShowTokenEditor(prev => !prev)}
            className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 border border-white/10 text-pulse-muted text-xs font-medium hover:bg-white/10 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {showTokenEditor ? 'Hide Bot Token Editor' : 'Change Bot'}
          </button>

          {linked ? (
            <button
              onClick={disconnectTelegramChat}
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-pulse-danger/10 border border-pulse-danger/20 text-pulse-danger text-xs font-medium hover:bg-pulse-danger/20 transition-colors"
            >
              <Unplug className="w-3.5 h-3.5" />
              Disconnect Chat
            </button>
          ) : (
            <button
              onClick={resetTelegramBot}
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-pulse-danger/10 border border-pulse-danger/20 text-pulse-danger text-xs font-medium hover:bg-pulse-danger/20 transition-colors"
            >
              <Unplug className="w-3.5 h-3.5" />
              Reset Bot Setup
            </button>
          )}
        </div>
      )}

      {actionMessage && <p className="text-xs text-pulse-accent">{actionMessage}</p>}
      {tokenError && <p className="text-xs text-pulse-danger">{tokenError}</p>}
    </div>
  )
}

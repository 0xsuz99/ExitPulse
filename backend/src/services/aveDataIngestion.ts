import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { config } from '../config';
import { signalDetector } from './signalDetector';
import type { Chain, SmartWallet, UserHolding, WalletExit } from '../types';

type RuntimeMode = 'demo' | 'live';

interface AveStreamTx {
  chain?: string;
  wallet_address?: string;
  from_symbol?: string;
  to_symbol?: string;
  from_address?: string;
  to_address?: string;
  target_token?: string;
  tx_swap_type?: number | string;
  from_amount?: string;
  to_amount?: string;
  amount_usd?: string | number;
  from_price_usd?: string | number;
  to_price_usd?: string | number;
  transaction?: string;
  tx_hash?: string;
  time?: number | string;
}

interface AveStreamMessage {
  jsonrpc?: string;
  id?: number;
  method?: string;
  params?: unknown[];
  result?: {
    topic?: string;
    tx?: AveStreamTx;
  };
  error?: unknown;
}

interface SubscriptionTarget {
  key: string;
  chain: Chain;
  chainTopic: string;
  tokenAddress: string;
  symbol: string;
}

export interface LiveIngestionStatus {
  runtimeMode: RuntimeMode;
  connected: boolean;
  connecting: boolean;
  streamUrl: string;
  reconnectAttempt: number;
  activeSubscriptionCount: number;
  watchlistCount: number;
  watchedSymbols: string[];
  trackedWalletCount: number;
  messagesReceived: number;
  txEventsReceived: number;
  trackedWalletMatches: number;
  exitsEmitted: number;
  signalsEmitted: number;
  demoExecutions: number;
  demoFailures: number;
  lastMessageAt?: number;
  lastExitAt?: number;
  lastSignalAt?: number;
  lastError?: string;
}

const NATIVE_PLACEHOLDER_BY_CHAIN: Record<Chain, string> = {
  bsc: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  eth: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  base: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  solana: 'sol',
};

const WRAPPED_NATIVE_BY_CHAIN: Record<Chain, string> = {
  bsc: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
  eth: '0xc02aa39b223fe8d0a0e5c4f27ead9083c756cc2',
  base: '0x4200000000000000000000000000000000000006',
  solana: 'So11111111111111111111111111111111111111112',
};

const CHAIN_TO_TOPIC: Record<Chain, string> = {
  bsc: 'bsc',
  eth: 'eth',
  base: 'base',
  solana: 'solana',
};

const WS_CHAIN_TO_INTERNAL: Record<string, Chain> = {
  bsc: 'bsc',
  bnbsmartchain: 'bsc',
  eth: 'eth',
  ethereum: 'eth',
  base: 'base',
  solana: 'solana',
};

const DEFAULT_SYMBOL_BY_CHAIN: Record<Chain, string> = {
  bsc: 'BNB',
  eth: 'ETH',
  base: 'ETH',
  solana: 'SOL',
};

function normalizeChain(value?: string): Chain | null {
  if (!value) return null;
  return WS_CHAIN_TO_INTERNAL[value.toLowerCase()] || null;
}

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toTimestampMs(value: unknown): number {
  const num = toNumber(value);
  if (num <= 0) return Date.now();
  return num < 1_000_000_000_000 ? Math.floor(num * 1000) : Math.floor(num);
}

function estimateExitRatio(amountUsd: number): number {
  if (amountUsd >= 250000) return 1.0;
  if (amountUsd >= 100000) return 0.85;
  if (amountUsd >= 25000) return 0.65;
  if (amountUsd >= 5000) return 0.45;
  if (amountUsd >= 1000) return 0.3;
  return 0.2;
}

class AveDataIngestionService extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private destroyed = false;
  private desiredTargets: Map<string, SubscriptionTarget> = new Map();
  private activeSubscriptionKeys: Set<string> = new Set();
  private trackedWallets: Map<string, SmartWallet> = new Map();
  private seenTxKeys: Map<string, number> = new Map();
  private readonly seenTxTtlMs = 15 * 60 * 1000;

  private status: LiveIngestionStatus = {
    runtimeMode: 'demo',
    connected: false,
    connecting: false,
    streamUrl: config.ave.dataWssUrl,
    reconnectAttempt: 0,
    activeSubscriptionCount: 0,
    watchlistCount: 0,
    watchedSymbols: [],
    trackedWalletCount: 0,
    messagesReceived: 0,
    txEventsReceived: 0,
    trackedWalletMatches: 0,
    exitsEmitted: 0,
    signalsEmitted: 0,
    demoExecutions: 0,
    demoFailures: 0,
  };

  private readonly onModeChanged = () => {
    this.syncContext();
  };

  private readonly onHoldingsUpdated = () => {
    this.syncContext();
  };

  private readonly onConfigUpdated = () => {
    this.syncContext();
  };

  private readonly onSignalGenerated = () => {
    const now = Date.now();
    this.status.signalsEmitted += 1;
    this.status.lastSignalAt = now;
    // In demo mode, signal generation itself is the stream heartbeat.
    if (this.status.runtimeMode !== 'live') {
      this.status.lastMessageAt = now;
    }
  };

  private readonly onExitExecuted = (data: any) => {
    if (data?.demo) {
      this.status.demoExecutions += 1;
      this.status.lastExitAt = Date.now();
    }
  };

  private readonly onExitFailed = (data: any) => {
    if (data?.demo) {
      this.status.demoFailures += 1;
    }
  };

  start() {
    if (this.destroyed) return;

    signalDetector.on('mode_changed', this.onModeChanged);
    signalDetector.on('holdings_updated', this.onHoldingsUpdated);
    signalDetector.on('config_updated', this.onConfigUpdated);
    signalDetector.on('signal', this.onSignalGenerated);
    signalDetector.on('exit_executed', this.onExitExecuted);
    signalDetector.on('exit_failed', this.onExitFailed);

    this.syncContext();
  }

  stop() {
    signalDetector.off('mode_changed', this.onModeChanged);
    signalDetector.off('holdings_updated', this.onHoldingsUpdated);
    signalDetector.off('config_updated', this.onConfigUpdated);
    signalDetector.off('signal', this.onSignalGenerated);
    signalDetector.off('exit_executed', this.onExitExecuted);
    signalDetector.off('exit_failed', this.onExitFailed);

    this.destroyed = true;
    this.clearReconnectTimer();
    this.clearPingTimer();
    this.activeSubscriptionKeys.clear();
    this.desiredTargets.clear();

    this.closeSocketSafely();

    this.status.connected = false;
    this.status.connecting = false;
    this.status.activeSubscriptionCount = 0;
  }

  getStatus(): LiveIngestionStatus {
    return {
      ...this.status,
      activeSubscriptionCount: this.activeSubscriptionKeys.size,
      watchlistCount: this.desiredTargets.size,
      reconnectAttempt: this.reconnectAttempt,
    };
  }

  private syncContext() {
    const cfg = signalDetector.getUserConfig();
    const holdings = signalDetector.getHoldings();
    const tracked = signalDetector.getTrackedWallets();
    const previousMode = this.status.runtimeMode;

    if (previousMode !== cfg.runtimeMode) {
      this.status.lastMessageAt = undefined;
      this.status.lastExitAt = undefined;
      this.status.lastError = undefined;
      this.reconnectAttempt = 0;
      this.status.reconnectAttempt = 0;
    }

    this.status.runtimeMode = cfg.runtimeMode;
    this.trackedWallets = new Map(tracked.map(w => [normalizeAddress(w.address), w]));
    this.status.trackedWalletCount = this.trackedWallets.size;

    const targets = this.buildSubscriptionTargets(holdings);
    this.desiredTargets = new Map(targets.map(target => [target.key, target]));
    this.status.watchedSymbols = [...new Set(targets.map(t => t.symbol))].slice(0, 8);
    this.status.watchlistCount = this.desiredTargets.size;

    if (cfg.runtimeMode !== 'live') {
      this.disconnect();
      return;
    }

    this.ensureConnected();
    this.reconcileSubscriptions();
  }

  private buildSubscriptionTargets(holdings: UserHolding[]): SubscriptionTarget[] {
    const targets: SubscriptionTarget[] = [];
    const seen = new Set<string>();

    for (const holding of holdings) {
      const rawToken = (holding.tokenAddress || '').trim();
      if (!rawToken) continue;

      const streamToken = this.resolveStreamTokenAddress(holding.chain, rawToken);
      const tokenForKey = normalizeAddress(streamToken);

      const chainTopic = CHAIN_TO_TOPIC[holding.chain];
      const key = `${chainTopic}:${tokenForKey}`;
      if (seen.has(key)) continue;
      seen.add(key);

      targets.push({
        key,
        chain: holding.chain,
        chainTopic,
        tokenAddress: streamToken,
        symbol: holding.tokenSymbol || DEFAULT_SYMBOL_BY_CHAIN[holding.chain],
      });
    }

    return targets;
  }

  private resolveStreamTokenAddress(chain: Chain, tokenAddress: string): string {
    const normalized = normalizeAddress(tokenAddress);
    const nativePlaceholder = normalizeAddress(NATIVE_PLACEHOLDER_BY_CHAIN[chain]);
    if (normalized === nativePlaceholder) {
      return WRAPPED_NATIVE_BY_CHAIN[chain];
    }
    return tokenAddress;
  }

  private mapTokenForSignal(chain: Chain, tokenAddress: string): string {
    const normalized = normalizeAddress(tokenAddress);
    const wrappedNative = normalizeAddress(WRAPPED_NATIVE_BY_CHAIN[chain]);
    if (normalized === wrappedNative) {
      return NATIVE_PLACEHOLDER_BY_CHAIN[chain];
    }
    return tokenAddress;
  }

  private ensureConnected() {
    if (this.ws || this.status.connecting || this.destroyed) return;

    this.status.connecting = true;
    this.status.lastError = undefined;

    const headers: Record<string, string> = {};
    if (config.ave.apiKey) {
      headers['X-API-KEY'] = config.ave.apiKey;
    }

    const wsUrl = this.buildWebSocketUrl(config.ave.dataWssUrl);
    this.ws = new WebSocket(wsUrl, {
      headers: Object.keys(headers).length ? headers : undefined,
    });

    this.ws.on('open', () => {
      this.status.connected = true;
      this.status.connecting = false;
      this.reconnectAttempt = 0;
      this.status.reconnectAttempt = 0;
      this.status.lastError = undefined;
      this.startPingLoop();
      this.reconcileSubscriptions(true);
      console.log('[AveData] Connected to Ave Data WSS');
    });

    this.ws.on('message', raw => {
      this.handleIncoming(raw);
    });

    this.ws.on('error', err => {
      this.status.lastError = err.message;
      this.status.connecting = false;
      console.error('[AveData] WebSocket error:', err.message);
    });

    this.ws.on('close', () => {
      this.status.connected = false;
      this.status.connecting = false;
      this.clearPingTimer();
      this.ws = null;
      this.activeSubscriptionKeys.clear();

      if (this.destroyed || this.status.runtimeMode !== 'live') return;
      this.scheduleReconnect();
    });
  }

  private buildWebSocketUrl(baseUrl: string): string {
    if (!config.ave.apiKey) return baseUrl;
    const hasQuery = baseUrl.includes('?');
    const separator = hasQuery ? '&' : '?';
    return `${baseUrl}${separator}x-api-key=${encodeURIComponent(config.ave.apiKey)}`;
  }

  private disconnect(reason?: string, markAsError = false) {
    this.clearReconnectTimer();
    this.clearPingTimer();
    this.activeSubscriptionKeys.clear();

    this.closeSocketSafely();

    this.status.connected = false;
    this.status.connecting = false;
    if (markAsError && reason) {
      this.status.lastError = reason;
    }
  }

  private closeSocketSafely() {
    const socket = this.ws;
    if (!socket) return;

    this.ws = null;

    // Ignore expected shutdown races (e.g., close while CONNECTING).
    socket.removeAllListeners('open');
    socket.removeAllListeners('message');
    socket.removeAllListeners('close');
    socket.on('error', () => {});

    try {
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
        socket.close();
      } else if (socket.readyState !== WebSocket.CLOSED) {
        socket.terminate();
      }
    } catch {
      // No-op
    }
  }

  private scheduleReconnect() {
    this.clearReconnectTimer();
    this.reconnectAttempt += 1;
    this.status.reconnectAttempt = this.reconnectAttempt;

    const waitMs = Math.min(30000, 2000 * this.reconnectAttempt);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnected();
    }, waitMs);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startPingLoop() {
    this.clearPingTimer();
    this.pingTimer = setInterval(() => {
      this.sendJson({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'ping',
      });
    }, 20000);
  }

  private clearPingTimer() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private reconcileSubscriptions(forceAll = false) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const desiredKeys = new Set(this.desiredTargets.keys());

    if (forceAll) {
      this.activeSubscriptionKeys.clear();
    }

    for (const key of [...this.activeSubscriptionKeys]) {
      if (!desiredKeys.has(key)) {
        const [chainTopic, tokenAddress] = key.split(':');
        this.sendJson({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'unsubscribe',
          params: ['multi_tx', tokenAddress, chainTopic],
        });
        this.activeSubscriptionKeys.delete(key);
      }
    }

    for (const [key, target] of this.desiredTargets) {
      if (this.activeSubscriptionKeys.has(key)) continue;
      this.sendJson({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'subscribe',
        params: ['multi_tx', target.tokenAddress, target.chainTopic],
      });
      this.activeSubscriptionKeys.add(key);
    }

    this.status.activeSubscriptionCount = this.activeSubscriptionKeys.size;
  }

  private sendJson(payload: unknown) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }

  private handleIncoming(raw: WebSocket.RawData) {
    const text = typeof raw === 'string' ? raw : raw.toString('utf8');
    if (!text) return;

    if (text === 'pong') {
      this.status.lastMessageAt = Date.now();
      return;
    }

    let payload: AveStreamMessage;
    try {
      payload = JSON.parse(text) as AveStreamMessage;
    } catch {
      return;
    }

    this.status.messagesReceived += 1;
    this.status.lastMessageAt = Date.now();

    if (payload.error) {
      this.status.lastError = typeof payload.error === 'string' ? payload.error : JSON.stringify(payload.error);
      return;
    }

    const tx = payload.result?.tx;
    if (!tx) return;

    this.status.txEventsReceived += 1;
    const exit = this.mapTxToWalletExit(tx);
    if (!exit) return;

    this.status.trackedWalletMatches += 1;
    this.status.exitsEmitted += 1;
    this.status.lastExitAt = Date.now();
    this.emit('wallet_exit', exit);
  }

  private mapTxToWalletExit(tx: AveStreamTx): WalletExit | null {
    const chain = normalizeChain(tx.chain);
    if (!chain) return null;

    const walletAddress = tx.wallet_address ? normalizeAddress(tx.wallet_address) : '';
    if (!walletAddress) return null;

    const trackedWallet = this.trackedWallets.get(walletAddress);
    if (!trackedWallet) return null;

    const targetTokenRaw = (tx.target_token || '').toString().trim();
    const fromAddressRaw = (tx.from_address || '').toString().trim();
    const toAddressRaw = (tx.to_address || '').toString().trim();
    if (!targetTokenRaw || !fromAddressRaw || !toAddressRaw) return null;

    const targetToken = normalizeAddress(targetTokenRaw);
    const fromAddress = normalizeAddress(fromAddressRaw);
    const toAddress = normalizeAddress(toAddressRaw);
    const swapType = toNumber(tx.tx_swap_type);

    const isSell = swapType === 1 || (fromAddress === targetToken && toAddress !== targetToken);
    if (!isSell) return null;

    const txHash = (tx.transaction || tx.tx_hash || '').toString();
    const txFingerprint = txHash || `${walletAddress}:${targetToken}:${String(tx.time || '')}:${String(tx.from_amount || '')}`;
    if (this.isDuplicateTx(txFingerprint)) return null;

    const mappedTokenAddress = this.mapTokenForSignal(chain, targetTokenRaw);
    const mappedKey = `${CHAIN_TO_TOPIC[chain]}:${normalizeAddress(this.resolveStreamTokenAddress(chain, mappedTokenAddress))}`;
    const isWatched = this.desiredTargets.has(mappedKey);
    if (!isWatched) return null;

    const amountUsd = toNumber(tx.amount_usd);
    const exitRatio = estimateExitRatio(amountUsd);
    const soldAmount = (tx.from_amount || tx.amount_usd || '0').toString();
    const priceUsdSource = fromAddress === targetToken ? tx.from_price_usd : tx.to_price_usd;
    const priceUsd = toNumber(priceUsdSource).toFixed(6);

    const tokenSymbol = mappedTokenAddress.toLowerCase() === NATIVE_PLACEHOLDER_BY_CHAIN[chain]
      ? DEFAULT_SYMBOL_BY_CHAIN[chain]
      : (fromAddress === targetToken ? tx.from_symbol : tx.to_symbol) || 'TOKEN';

    const holdDurationDays = Math.max(7, Math.round(45 - trackedWallet.pnlRank * 0.4));

    return {
      walletAddress,
      chain,
      tokenAddress: mappedTokenAddress,
      tokenSymbol,
      amountSold: soldAmount,
      totalPosition: soldAmount,
      exitRatio,
      holdDurationDays,
      txHash: txHash || this.syntheticHashFromFingerprint(txFingerprint),
      priceUsd,
      timestamp: toTimestampMs(tx.time),
    };
  }

  private syntheticHashFromFingerprint(value: string): string {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }
    return `0x${hash.toString(16).padStart(64, '0')}`;
  }

  private isDuplicateTx(key: string): boolean {
    const now = Date.now();

    for (const [existingKey, seenAt] of this.seenTxKeys) {
      if (now - seenAt > this.seenTxTtlMs) {
        this.seenTxKeys.delete(existingKey);
      }
    }

    if (this.seenTxKeys.has(key)) return true;
    this.seenTxKeys.set(key, now);
    return false;
  }
}

export const aveDataIngestion = new AveDataIngestionService();

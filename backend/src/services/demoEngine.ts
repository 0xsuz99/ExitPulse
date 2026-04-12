import { CESEngine } from './cesEngine';
import { ALL_TRACKED_SMART_WALLETS, DEMO_HOLDINGS } from './demoData';
import type { CESSignal, UserHolding, WalletExit } from '../types';

type SendEvent = (type: string, data: any) => void;

const DEFAULT_TRACKED_LIMIT = 50;
const MIN_TRACKED_LIMIT = 10;
const MAX_TRACKED_LIMIT = 100;

function fakeTxHash(): string {
  return `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
}

function clampTrackedWalletLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_TRACKED_LIMIT;
  return Math.max(MIN_TRACKED_LIMIT, Math.min(MAX_TRACKED_LIMIT, Math.floor(limit)));
}

export interface DemoEngineStatus {
  connected: boolean;
  watchlistCount: number;
  watchedSymbols: string[];
  trackedWalletCount: number;
  trackedWalletMatches: number;
  signalsEmitted: number;
  signalUpdates: number;
  demoExecutions: number;
  demoFailures: number;
  lastMessageAt?: number;
  lastExitAt?: number;
  lastSignalAt?: number;
}

/**
 * Per-WebSocket-session demo engine.
 *
 * Every browser tab gets a fully isolated simulation state:
 * - independent CES buffer
 * - independent signal list
 * - independent burst timer
 */
export class DemoEngine {
  private readonly ces: CESEngine;
  private readonly send: SendEvent;
  private readonly tokenLastBurstAt: Map<string, number> = new Map();
  private readonly seedHoldingsByKey: Map<string, UserHolding>;

  private signals: CESSignal[] = [];
  private holdings: UserHolding[];
  private timer: NodeJS.Timeout | null = null;
  private executionMode: 'manual' | 'auto';
  private trackedWalletLimit = DEFAULT_TRACKED_LIMIT;
  private status: DemoEngineStatus = {
    connected: false,
    watchlistCount: 0,
    watchedSymbols: [],
    trackedWalletCount: DEFAULT_TRACKED_LIMIT,
    trackedWalletMatches: 0,
    signalsEmitted: 0,
    signalUpdates: 0,
    demoExecutions: 0,
    demoFailures: 0,
  };

  constructor(
    send: SendEvent,
    executionMode: 'manual' | 'auto' = 'manual',
    trackedWalletLimit = DEFAULT_TRACKED_LIMIT
  ) {
    this.send = send;
    this.executionMode = executionMode;
    this.ces = new CESEngine();
    this.holdings = DEMO_HOLDINGS.map(holding => ({ ...holding }));
    this.seedHoldingsByKey = new Map(
      DEMO_HOLDINGS.map(holding => [this.getHoldingKey(holding.chain, holding.tokenAddress), { ...holding }])
    );
    this.refreshWatchlistStatus();
    this.setTrackedWalletLimit(trackedWalletLimit);
  }

  start() {
    if (this.timer) return;

    this.status.connected = true;

    // Faster first signal so a new session does not look empty.
    this.timer = setTimeout(() => {
      this.generateBurst({ coldStart: true, ensureSignal: true });
      this.scheduleNext();
    }, 700);
  }

  stop() {
    this.status.connected = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  setExecutionMode(mode: 'manual' | 'auto') {
    this.executionMode = mode;
  }

  setTrackedWalletLimit(limit: number) {
    const normalized = clampTrackedWalletLimit(limit);
    this.trackedWalletLimit = normalized;
    this.ces.setTrackedWallets(ALL_TRACKED_SMART_WALLETS.slice(0, normalized));
    this.status.trackedWalletCount = normalized;
  }

  getSignals(): CESSignal[] {
    return [...this.signals];
  }

  getHoldings(): UserHolding[] {
    return this.holdings.map(holding => ({ ...holding }));
  }

  getStatus(): DemoEngineStatus {
    return {
      ...this.status,
      watchedSymbols: [...this.status.watchedSymbols],
    };
  }

  getSignalById(id: string): CESSignal | undefined {
    return this.signals.find(signal => signal.id === id);
  }

  dismissSignal(id: string): boolean {
    const idx = this.signals.findIndex(signal => signal.id === id);
    if (idx < 0) return false;

    const signal = this.signals[idx];
    this.ces.clearTokenBuffer(signal.chain, signal.tokenAddress);
    this.signals.splice(idx, 1);
    this.send('signal_removed', { signalId: id });
    return true;
  }

  async simulateExit(
    signalId: string,
    source: 'dashboard' | 'auto' | 'telegram' = 'dashboard'
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    const signal = this.getSignalById(signalId);
    if (!signal) return { success: false, error: 'Signal not found' };

    if (signal.executionStatus === 'executing' || signal.executionStatus === 'executed') {
      return { success: false, error: 'Already executing or executed' };
    }

    if (source === 'auto' && this.executionMode !== 'auto') {
      return { success: false, error: 'Auto execution cancelled because mode is manual' };
    }

    this.updateStatus(signal, 'executing', source);
    await new Promise(resolve => setTimeout(resolve, 1200));

    if (source === 'auto' && this.executionMode !== 'auto') {
      this.updateStatus(signal, 'pending', source);
      return { success: false, error: 'Auto execution cancelled because mode switched to manual' };
    }

    const txHash = fakeTxHash();
    this.updateStatus(signal, 'executed', source, txHash);
    this.ces.clearTokenBuffer(signal.chain, signal.tokenAddress);
    this.applyExitToHoldings(signal);

    this.status.demoExecutions += 1;
    this.status.lastExitAt = Date.now();

    this.send('exit_executed', {
      signalId: signal.id,
      txHash,
      status: 'confirmed',
      demo: true,
      source,
    });

    return { success: true, txHash };
  }

  private scheduleNext() {
    // With 12 tokens, we can burst every 3–5 s and still cycle through variety.
    const delay = 3000 + Math.random() * 2000;
    this.timer = setTimeout(() => {
      this.generateBurst();
      this.scheduleNext();
    }, delay);
  }

  private generateBurst(opts?: { coldStart?: boolean; ensureSignal?: boolean }) {
    const isColdStart = opts?.coldStart === true;
    const ensureSignal = opts?.ensureSignal === true;

    this.status.lastMessageAt = Date.now();

    const attempts = ensureSignal ? 3 : 1;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const emitted = this.generateSingleBurst(isColdStart && attempt === 0);
      if (emitted > 0) break;
    }
  }

  private generateSingleBurst(isColdStart: boolean): number {
    const isAuto = this.executionMode === 'auto';
    const now = Date.now();

    const cooldownMs = 7000;
    const holdingSource = this.holdings.length ? this.holdings : DEMO_HOLDINGS;
    const available = holdingSource.filter(holding => {
      const tokenKey = `${holding.chain}:${holding.tokenAddress}`.toLowerCase();
      return now - (this.tokenLastBurstAt.get(tokenKey) ?? 0) >= cooldownMs;
    });
    const pool = available.length > 0 ? available : holdingSource;

    const holding = isColdStart
      ? (pool.find(h => h.tokenSymbol === 'BTCB') ?? pool.find(h => h.tokenSymbol === 'ETH') ?? pool[0])
      : pool[Math.floor(Math.random() * pool.length)];

    if (!holding) return 0;

    const tokenKey = `${holding.chain}:${holding.tokenAddress}`.toLowerCase();
    this.tokenLastBurstAt.set(tokenKey, now);

    const burstSize = isColdStart
      ? 5
      : isAuto
        ? (Math.random() < 0.35 ? 5 : 4)
        : (Math.random() < 0.4 ? 4 : 3);

    const walletPoolSize = Math.max(20, Math.min(this.trackedWalletLimit, 60));
    const wallets = [...ALL_TRACKED_SMART_WALLETS.slice(0, walletPoolSize)]
      .sort(() => Math.random() - 0.5)
      .slice(0, burstSize);

    const freshHoldings = this.getHoldings();
    let emittedSignals = 0;

    for (const wallet of wallets) {
      this.status.trackedWalletMatches += 1;

      const baseExitRatio = isAuto
        ? (0.28 + Math.random() * 0.34)
        : (0.22 + Math.random() * 0.28);
      const boosted = Math.random() < (isAuto ? 0.18 : 0.12)
        ? Math.min(0.85, baseExitRatio + 0.2)
        : baseExitRatio;
      const holdDays = 9 + Math.floor(Math.random() * 45);

      const balance = Number(holding.balance);
      const priceUsd = balance > 0
        ? (holding.balanceUsd / balance * 1e18).toFixed(4)
        : '0.0000';

      const exit: WalletExit = {
        walletAddress: wallet.address,
        chain: wallet.chain,
        tokenAddress: holding.tokenAddress,
        tokenSymbol: holding.tokenSymbol,
        amountSold: Math.floor(balance * boosted).toString(),
        totalPosition: holding.balance,
        exitRatio: boosted,
        holdDurationDays: holdDays,
        txHash: fakeTxHash(),
        priceUsd,
        timestamp: Date.now(),
      };

      if (this.processExit(exit, freshHoldings)) {
        emittedSignals += 1;
      }
    }

    return emittedSignals;
  }

  private processExit(exit: WalletExit, freshHoldings: UserHolding[]): boolean {
    const nextSignal = this.ces.processExit(exit, freshHoldings);
    if (!nextSignal) return false;

    const tokenKey = `${nextSignal.chain}:${nextSignal.tokenAddress}`.toLowerCase();
    const existingIndex = this.signals.findIndex(
      signal => `${signal.chain}:${signal.tokenAddress}`.toLowerCase() === tokenKey
    );

    if (existingIndex >= 0) {
      const existing = this.signals[existingIndex];

      // After an execution/failure, rotate in a fresh signal for the same token.
      if (existing.executionStatus === 'executed' || existing.executionStatus === 'failed') {
        this.signals[existingIndex] = nextSignal;
        this.emitSignal(nextSignal, 'created');
        this.maybeAutoExecute(nextSignal);
        return true;
      }

      existing.score = nextSignal.score;
      existing.severity = nextSignal.severity;
      existing.exits = nextSignal.exits;
      existing.userHolding = nextSignal.userHolding;
      existing.timestamp = nextSignal.timestamp;
      existing.action = nextSignal.action;

      this.emitSignal(existing, 'updated');
      this.maybeAutoExecute(existing);
      return true;
    }

    this.signals.unshift(nextSignal);
    if (this.signals.length > 50) this.signals.pop();

    this.emitSignal(nextSignal, 'created');
    this.maybeAutoExecute(nextSignal);
    return true;
  }

  private maybeAutoExecute(signal: CESSignal) {
    if (
      signal.action === 'auto_exit' &&
      this.executionMode === 'auto' &&
      signal.executionStatus !== 'executing' &&
      signal.executionStatus !== 'executed'
    ) {
      void this.simulateExit(signal.id, 'auto');
    }
  }

  private emitSignal(signal: CESSignal, type: 'created' | 'updated') {
    if (type === 'created') {
      this.status.signalsEmitted += 1;
    } else {
      this.status.signalUpdates += 1;
    }
    this.status.lastSignalAt = Date.now();
    this.send('signal', signal);
  }

  private updateStatus(
    signal: CESSignal,
    status: CESSignal['executionStatus'],
    source?: CESSignal['executionSource'],
    txHash?: string
  ) {
    signal.executionStatus = status;
    if (source) signal.executionSource = source;
    if (txHash) signal.executionTxHash = txHash;
    if (status !== 'failed') signal.executionError = undefined;
    this.send('signal', signal);
  }

  private getHoldingKey(chain: string, tokenAddress: string) {
    return `${chain}:${tokenAddress}`.toLowerCase();
  }

  private refreshWatchlistStatus() {
    const active = this.holdings.filter(holding => holding.balanceUsd > 0);
    this.status.watchlistCount = active.length;
    this.status.watchedSymbols = active.map(holding => holding.tokenSymbol);
  }

  private applyExitToHoldings(signal: CESSignal) {
    const idx = this.holdings.findIndex(
      holding =>
        holding.chain === signal.chain &&
        holding.tokenAddress.toLowerCase() === signal.tokenAddress.toLowerCase()
    );
    if (idx < 0) return;

    // Full exit — remove the token entirely.
    // Smart money is leaving; you should too. No half-measures.
    this.holdings.splice(idx, 1);

    this.refreshWatchlistStatus();
    this.send('holdings_update', {
      holdings: this.getHoldings(),
      type: 'portfolio_updated',
    });

    // Auto-refill when portfolio is running low
    this.maybeRefillPortfolio();
  }

  private maybeRefillPortfolio() {
    const totalUsd = this.holdings.reduce((sum, h) => sum + h.balanceUsd, 0);
    const tokenCount = this.holdings.length;

    if (totalUsd >= 3000 && tokenCount >= 3) return;

    console.log(`[DemoEngine] Portfolio low ($${totalUsd.toFixed(0)}, ${tokenCount} tokens) — refilling from seed`);

    // Reset to fresh seed holdings
    this.holdings = DEMO_HOLDINGS.map(h => ({ ...h }));
    this.tokenLastBurstAt.clear();

    this.refreshWatchlistStatus();
    this.send('holdings_update', {
      holdings: this.getHoldings(),
      type: 'portfolio_updated',
    });
  }
}

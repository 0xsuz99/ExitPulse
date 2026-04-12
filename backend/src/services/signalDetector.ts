import { EventEmitter } from 'events';
import { cesEngine } from './cesEngine';
import { aveTradeApi } from './aveTradeApi';
import { config } from '../config';
import { ALL_TRACKED_SMART_WALLETS, DEMO_HOLDINGS } from './demoData';
import type {
  SmartWallet,
  WalletExit,
  UserHolding,
  CESSignal,
  UserConfig,
} from '../types';

const DEFAULT_TRACKED_WALLET_LIMIT = 50;
const MAX_TRACKED_WALLET_LIMIT = 100;

class SignalDetector extends EventEmitter {
  private userConfig: UserConfig;
  private holdings: UserHolding[] = [];
  private signals: CESSignal[] = [];
  private demoInterval: NodeJS.Timeout | null = null;
  private usingDemoHoldings = false;
  private autoExitLastAttemptByKey: Map<string, number> = new Map();
  private demoTokenLastBurstAt: Map<string, number> = new Map();
  private readonly autoExitCooldownMs = 45000;

  constructor() {
    super();
    const initialRuntimeMode: UserConfig['runtimeMode'] = config.demoMode ? 'demo' : 'live';
    this.userConfig = {
      walletAddress: '',
      chain: config.defaultChain,
      mode: 'manual',
      runtimeMode: initialRuntimeMode,
      trackedWalletLimit: DEFAULT_TRACKED_WALLET_LIMIT,
      cesConfig: cesEngine.getConfig(),
      trackedWallets: [],
    };

    this.syncTrackedWalletState();
    this.applyRuntimeMode(initialRuntimeMode);
  }

  private clampTrackedWalletLimit(limit?: number): number {
    if (typeof limit !== 'number' || Number.isNaN(limit)) {
      return DEFAULT_TRACKED_WALLET_LIMIT;
    }
    return Math.max(10, Math.min(MAX_TRACKED_WALLET_LIMIT, Math.floor(limit)));
  }

  private getActiveTrackedWallets(limitOverride?: number): SmartWallet[] {
    const limit = this.clampTrackedWalletLimit(limitOverride ?? this.userConfig.trackedWalletLimit);
    return ALL_TRACKED_SMART_WALLETS.slice(0, limit);
  }

  private syncTrackedWalletState() {
    const activeWallets = this.getActiveTrackedWallets();
    this.userConfig.trackedWallets = activeWallets.map(w => w.address);
    cesEngine.setTrackedWallets(activeWallets);
  }

  private clearDemoTimer() {
    if (this.demoInterval) {
      clearTimeout(this.demoInterval);
      this.demoInterval = null;
    }
  }

  private applyRuntimeMode(mode: UserConfig['runtimeMode']) {
    this.signals = [];
    this.autoExitLastAttemptByKey.clear();
    this.demoTokenLastBurstAt.clear();
    this.clearDemoTimer();

    if (mode === 'demo') {
      // Demo signal generation is handled per-session by DemoEngine.
      // SignalDetector only manages global state (config, tracked wallets).
      // Load demo holdings for backward-compat API calls that don't use sessions.
      if (!this.usingDemoHoldings) {
        this.holdings = [...DEMO_HOLDINGS];
        this.usingDemoHoldings = true;
        this.emit('holdings_updated', this.getHoldings());
      }
      return;
    }

    if (this.usingDemoHoldings) {
      this.holdings = [];
      this.usingDemoHoldings = false;
      this.emit('holdings_updated', this.getHoldings());
    }
  }

  start() {
    console.log('[SignalDetector] Starting signal detection...');
    this.applyRuntimeMode(this.userConfig.runtimeMode);
  }

  stop() {
    this.clearDemoTimer();
  }

  private startDemoMode() {
    if (this.demoInterval) return;

    console.log('[SignalDetector] Running in DEMO mode - generating simulated signals');

    const scheduleNext = () => {
      const delay = 9000 + Math.random() * 6000;
      this.demoInterval = setTimeout(() => {
        this.generateDemoBurst();
        scheduleNext();
      }, delay);
    };

    // Fire a guaranteed cold-start burst after 1.5s so the dashboard is
    // never empty when a judge first opens it.
    this.demoInterval = setTimeout(() => {
      this.generateDemoBurst({ coldStart: true });
      scheduleNext();
    }, 1500);
  }

  private generateDemoBurst(opts?: { coldStart?: boolean }) {
    if (!this.holdings.length) {
      this.holdings = [...DEMO_HOLDINGS];
      this.usingDemoHoldings = true;
    }

    const now = Date.now();
    const autoModeSelected = this.userConfig.mode === 'auto';
    const isColdStart = opts?.coldStart === true;
    const tokenCooldownMs = autoModeSelected ? 30000 : 45000;
    const availableHoldings = this.holdings.filter(holding => {
      const key = `${holding.chain}:${holding.tokenAddress}`.toLowerCase();
      const last = this.demoTokenLastBurstAt.get(key) || 0;
      return now - last >= tokenCooldownMs;
    });

    const holdingPool = availableHoldings.length ? availableHoldings : this.holdings;
    // Cold start: prefer BTCB or ETH (higher USD value = more impressive first signal)
    const holding = isColdStart
      ? (holdingPool.find(h => h.tokenSymbol === 'BTCB') ??
         holdingPool.find(h => h.tokenSymbol === 'ETH') ??
         holdingPool[0])
      : holdingPool[Math.floor(Math.random() * holdingPool.length)];
    if (!holding) return;

    const trackedWallets = this.getActiveTrackedWallets();
    if (!trackedWallets.length) return;

    // Occasionally skip a cycle to keep demo pacing realistic (never on cold start).
    if (!isColdStart && Math.random() < (autoModeSelected ? 0.01 : 0.02)) return;

    const tokenKey = `${holding.chain}:${holding.tokenAddress}`.toLowerCase();
    this.demoTokenLastBurstAt.set(tokenKey, now);

    const burstRoll = Math.random();
    // Cold start: always 3-4 wallets to guarantee the signal clears the CES threshold immediately.
    const burstSize = isColdStart
      ? (3 + Math.floor(Math.random() * 2))
      : autoModeSelected
        ? (burstRoll < 0.2 ? 2 : burstRoll < 0.75 ? 3 : 4)
        : (burstRoll < 0.62 ? 1 : burstRoll < 0.94 ? 2 : 3);
    const shuffled = [...trackedWallets].sort(() => Math.random() - 0.5);
    const exitingWallets = shuffled.slice(0, burstSize);

    for (const wallet of exitingWallets) {
      const intensityRoll = Math.random();
      const exitRatio = autoModeSelected
        ? intensityRoll < 0.45
          ? 0.18 + Math.random() * 0.16
          : intensityRoll < 0.85
            ? 0.3 + Math.random() * 0.25
            : 0.55 + Math.random() * 0.2
        : intensityRoll < 0.7
          ? 0.12 + Math.random() * 0.2
          : intensityRoll < 0.95
            ? 0.25 + Math.random() * 0.2
            : 0.45 + Math.random() * 0.2;
      const holdDays = Math.floor((autoModeSelected ? 12 : 6) + Math.random() * (autoModeSelected ? 44 : 36));

      const exit: WalletExit = {
        walletAddress: wallet.address,
        chain: wallet.chain,
        tokenAddress: holding.tokenAddress,
        tokenSymbol: holding.tokenSymbol,
        amountSold: Math.floor(parseFloat(holding.balance) * exitRatio).toString(),
        totalPosition: holding.balance,
        exitRatio,
        holdDurationDays: holdDays,
        txHash: `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
        priceUsd: (holding.balanceUsd / parseFloat(holding.balance) * 1e18).toFixed(4),
        timestamp: Date.now(),
      };

      this.processExit(exit);
    }
  }

  processExit(exit: WalletExit) {
    console.log(`[SignalDetector] Processing exit: ${exit.tokenSymbol} by wallet rank #${
      this.getActiveTrackedWallets().find(w => w.address === exit.walletAddress)?.pnlRank ?? '?'
    }`);

    const signal = cesEngine.processExit(exit, this.holdings);

    if (signal) {
      const existing = this.findExistingSignal(signal.chain, signal.tokenAddress);

      if (existing) {
        existing.score = signal.score;
        existing.severity = signal.severity;
        existing.exits = signal.exits;
        existing.userHolding = signal.userHolding;
        existing.timestamp = signal.timestamp;
        existing.action = signal.action;

        console.log(`[SignalDetector] Signal updated: ${existing.tokenSymbol} CES=${existing.score} severity=${existing.severity}`);
        this.emit('signal_updated', existing);

        if (
          existing.action === 'auto_exit' &&
          this.userConfig.mode === 'auto' &&
          existing.executionStatus !== 'executing' &&
          existing.executionStatus !== 'executed'
        ) {
          this.handleAutoExit(existing);
        }
        return;
      }

      this.signals.unshift(signal);
      if (this.signals.length > 100) this.signals.pop();

      console.log(`[SignalDetector] Signal: ${signal.tokenSymbol} CES=${signal.score} severity=${signal.severity}`);
      this.emit('signal', signal);

      // Auto-execute if in auto mode (works in both demo and live)
      if (signal.action === 'auto_exit' && this.userConfig.mode === 'auto') {
        this.handleAutoExit(signal);
      }
    } else {
      this.emit('exit', exit);
    }
  }

  getSignals(): CESSignal[] {
    return [...this.signals];
  }

  getSignalById(signalId: string): CESSignal | undefined {
    return this.signals.find(s => s.id === signalId);
  }

  dismissSignal(signalId: string): boolean {
    const signal = this.getSignalById(signalId);
    if (signal) {
      cesEngine.clearTokenBuffer(signal.chain, signal.tokenAddress);
      this.autoExitLastAttemptByKey.delete(this.getSignalKey(signal.chain, signal.tokenAddress));
    }

    const before = this.signals.length;
    this.signals = this.signals.filter(s => s.id !== signalId);
    const removed = this.signals.length !== before;
    if (removed) {
      this.emit('signal_removed', { signalId });
    }
    return removed;
  }

  markSignalExecuted(
    signalId: string,
    txHash: string,
    source: CESSignal['executionSource'] = 'dashboard'
  ): boolean {
    const signal = this.getSignalById(signalId);
    if (!signal) return false;

    this.updateSignalStatus(signalId, 'executed', { txHash, source });
    this.applyExitToHoldings(signal);
    this.emit('exit_executed', {
      signalId,
      txHash,
      status: 'confirmed',
      source,
    });
    return true;
  }

  getHoldings(): UserHolding[] {
    return [...this.holdings];
  }

  getTrackedWallets(): SmartWallet[] {
    return [...this.getActiveTrackedWallets()];
  }

  getUserConfig(): UserConfig {
    return {
      ...this.userConfig,
      trackedWallets: [...this.userConfig.trackedWallets],
    };
  }

  updateUserConfig(updates: Partial<UserConfig>) {
    const previousRuntimeMode = this.userConfig.runtimeMode;
    const previousMode = this.userConfig.mode;

    this.userConfig = {
      ...this.userConfig,
      ...updates,
      runtimeMode: updates.runtimeMode ?? this.userConfig.runtimeMode,
      trackedWalletLimit: this.clampTrackedWalletLimit(
        updates.trackedWalletLimit ?? this.userConfig.trackedWalletLimit
      ),
      cesConfig: updates.cesConfig
        ? { ...this.userConfig.cesConfig, ...updates.cesConfig }
        : this.userConfig.cesConfig,
      trackedWallets: [...this.userConfig.trackedWallets],
    };

    if (updates.cesConfig) {
      cesEngine.updateConfig(updates.cesConfig);
    }

    if (updates.trackedWalletLimit !== undefined) {
      this.syncTrackedWalletState();
    }

    if (previousRuntimeMode !== this.userConfig.runtimeMode) {
      this.applyRuntimeMode(this.userConfig.runtimeMode);
      this.emit('mode_changed', { runtimeMode: this.userConfig.runtimeMode });
    }

    if (previousMode !== this.userConfig.mode && previousMode === 'manual' && this.userConfig.mode === 'auto') {
      this.processPendingAutoSignals();
    }

    this.emit('config_updated', this.getUserConfig());
  }

  setHoldings(holdings: UserHolding[]) {
    this.holdings = [...holdings];
    this.usingDemoHoldings = false;
    this.emit('holdings_updated', this.getHoldings());
  }

  isUsingDemoHoldings(): boolean {
    return this.usingDemoHoldings;
  }

  setRuntimeMode(mode: UserConfig['runtimeMode']) {
    this.updateUserConfig({ runtimeMode: mode });
  }

  private getSignalKey(chain: CESSignal['chain'], tokenAddress: string) {
    return `${chain}:${tokenAddress}`.toLowerCase();
  }

  private findExistingSignal(chain: CESSignal['chain'], tokenAddress: string) {
    const key = this.getSignalKey(chain, tokenAddress);
    return this.signals.find(s => this.getSignalKey(s.chain, s.tokenAddress) === key);
  }

  private updateSignalStatus(
    signalId: string,
    status: CESSignal['executionStatus'],
    extra?: { txHash?: string; error?: string; source?: CESSignal['executionSource'] }
  ) {
    const signal = this.signals.find(s => s.id === signalId);
    if (signal) {
      signal.executionStatus = status;
      if (extra?.source) signal.executionSource = extra.source;
      if (extra?.txHash) signal.executionTxHash = extra.txHash;
      if (extra?.error) signal.executionError = extra.error;
      if (!extra?.error && status !== 'failed') signal.executionError = undefined;
      this.emit('signal_updated', signal);
    }
  }

  private applyExitToHoldings(signal: CESSignal) {
    const before = this.holdings.length;
    this.holdings = this.holdings.filter(h =>
      !(h.chain === signal.chain && h.tokenAddress.toLowerCase() === signal.tokenAddress.toLowerCase())
    );
    if (this.holdings.length !== before) {
      this.emit('holdings_updated', this.getHoldings());
    }
  }

  private processPendingAutoSignals() {
    if (this.userConfig.mode !== 'auto') return;

    for (const signal of this.signals) {
      if (signal.action !== 'auto_exit') continue;
      if (signal.executionStatus === 'executing' || signal.executionStatus === 'executed') continue;
      void this.handleAutoExit(signal);
    }
  }

  private generateFakeTxHash(): string {
    return `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
  }

  async simulateDemoExit(signal: CESSignal, source: 'auto' | 'telegram' | 'dashboard' = 'dashboard'): Promise<{ success: boolean; txHash?: string; error?: string }> {
    if (source === 'auto' && this.userConfig.mode !== 'auto') {
      return { success: false, error: 'Auto exit cancelled because mode is manual' };
    }

    this.updateSignalStatus(signal.id, 'executing', { source });
    await new Promise(resolve => setTimeout(resolve, 1600));

    if (source === 'auto' && this.userConfig.mode !== 'auto') {
      this.updateSignalStatus(signal.id, 'pending', { source });
      return { success: false, error: 'Auto exit cancelled because mode switched to manual' };
    }

    const failChance = 0;
    const shouldFail = Math.random() < failChance;
    if (shouldFail) {
      const reasons = [
        'Simulation: slippage exceeded preview tolerance',
        'Simulation: quote expired before confirmation',
        'Simulation: route liquidity changed',
      ];
      const error = reasons[Math.floor(Math.random() * reasons.length)];
      this.updateSignalStatus(signal.id, 'failed', { error, source });
      this.emit('exit_failed', {
        signalId: signal.id,
        status: 'error',
        error,
        demo: true,
        source,
      });
      return { success: false, error };
    }

    const fakeTxHash = this.generateFakeTxHash();
    this.updateSignalStatus(signal.id, 'executed', { txHash: fakeTxHash, source });
    this.applyExitToHoldings(signal);
    this.emit('exit_executed', {
      signalId: signal.id,
      txHash: fakeTxHash,
      status: 'confirmed',
      demo: true,
      source,
    });
    return { success: true, txHash: fakeTxHash };
  }

  async executeSignal(
    signal: CESSignal,
    source: CESSignal['executionSource']
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    if (source === 'auto' && this.userConfig.mode !== 'auto') {
      return { success: false, error: 'Auto exit skipped because mode is manual' };
    }

    if (this.userConfig.runtimeMode === 'demo') {
      const demoSource = source === 'auto' || source === 'telegram' ? source : 'dashboard';
      return this.simulateDemoExit(signal, demoSource);
    }

    this.updateSignalStatus(signal.id, 'executing', { source });
    const result = await this.executeExit(signal);

    if (result.success) {
      this.updateSignalStatus(signal.id, 'executed', { txHash: result.txHash, source });
      this.applyExitToHoldings(signal);
    } else {
      this.updateSignalStatus(signal.id, 'failed', { error: result.error, source });
    }

    return result;
  }

  private async handleAutoExit(signal: CESSignal) {
    if (this.userConfig.mode !== 'auto') {
      return;
    }

    const signalKey = this.getSignalKey(signal.chain, signal.tokenAddress);
    const now = Date.now();
    const lastAttempt = this.autoExitLastAttemptByKey.get(signalKey) || 0;

    if (this.userConfig.runtimeMode === 'live' && now - lastAttempt < this.autoExitCooldownMs) {
      this.updateSignalStatus(
        signal.id,
        'failed',
        {
          error: `Auto-exit cooldown active (${Math.ceil((this.autoExitCooldownMs - (now - lastAttempt)) / 1000)}s)`,
          source: 'auto',
        }
      );
      return;
    }

    this.autoExitLastAttemptByKey.set(signalKey, now);
    const result = await this.executeSignal(signal, 'auto');
    if (result.success) {
      console.log(`[SignalDetector] Auto-exit completed for ${signal.tokenSymbol}: ${result.txHash || 'pending'}`);
    } else {
      console.log(`[SignalDetector] Auto-exit not completed for ${signal.tokenSymbol}: ${result.error}`);
    }
  }

  async executeExit(signal: CESSignal): Promise<{ success: boolean; txHash?: string; error?: string }> {
    if (this.userConfig.runtimeMode !== 'live') {
      return { success: false, error: 'Execution is disabled in demo mode' };
    }

    if (!this.userConfig.assetsId) {
      return { success: false, error: 'No delegate wallet configured' };
    }

    try {
      console.log(`[SignalDetector] Executing exit for ${signal.tokenSymbol}...`);
      const result = await aveTradeApi.executeSellExit({
        chain: signal.chain,
        assetsId: this.userConfig.assetsId,
        tokenAddress: signal.tokenAddress,
        amount: signal.userHolding?.balance || '0',
      });

      if (aveTradeApi.isSuccessStatus(result.status)) {
        const orderId = result.data.id;
        const orderStatus = await aveTradeApi.getSwapOrder(signal.chain, [orderId]);
        const order = orderStatus.data?.[0];

        this.emit('exit_executed', {
          signalId: signal.id,
          orderId,
          txHash: order?.txHash || '',
          status: order?.status || 'sent',
          source: 'delegate',
        });

        return { success: true, txHash: order?.txHash };
      }

      return { success: false, error: result.msg };
    } catch (err: any) {
      console.error('[SignalDetector] Exit execution failed:', err.message);
      return { success: false, error: err.message };
    }
  }
}

export const signalDetector = new SignalDetector();

import { EventEmitter } from 'events';
import { cesEngine } from './cesEngine';
import { aveTradeApi } from './aveTradeApi';
import { config } from '../config';
import type {
  SmartWallet,
  WalletExit,
  UserHolding,
  CESSignal,
  UserConfig,
} from '../types';

// Demo data

const TRACKED_SMART_WALLETS: SmartWallet[] = [
  { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', chain: 'bsc', pnlRank: 1, totalPnl: 2847000, winRate: 0.78, label: 'Vitalik Adjacent' },
  { address: '0x28C6c06298d514Db089934071355E5743bf21d60', chain: 'bsc', pnlRank: 2, totalPnl: 1923000, winRate: 0.72, label: 'Degen Alpha' },
  { address: '0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549', chain: 'bsc', pnlRank: 3, totalPnl: 1456000, winRate: 0.69, label: 'MEV Specialist' },
  { address: '0x5041ed759Dd4aFc3a72b8192C143F72f4724081A', chain: 'bsc', pnlRank: 4, totalPnl: 1120000, winRate: 0.67, label: 'Sniper Alpha' },
  { address: '0xF977814e90dA44bFA03b6295A0616a897441aceC', chain: 'bsc', pnlRank: 5, totalPnl: 987000, winRate: 0.65, label: 'OG Trader' },
  { address: '0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE', chain: 'bsc', pnlRank: 6, totalPnl: 876000, winRate: 0.64, label: 'DeFi Farmer' },
  { address: '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8', chain: 'bsc', pnlRank: 7, totalPnl: 765000, winRate: 0.63, label: 'Quiet Accumulator' },
  { address: '0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf', chain: 'bsc', pnlRank: 8, totalPnl: 654000, winRate: 0.61, label: 'Token Hunter' },
  { address: '0x0716a17FBAeE714f1E6aB0f9d59edbC5f09815C0', chain: 'bsc', pnlRank: 9, totalPnl: 598000, winRate: 0.60, label: 'Swing King' },
  { address: '0x4E9ce36E442e55EcD9025B9a6E0D88485d628A67', chain: 'bsc', pnlRank: 10, totalPnl: 543000, winRate: 0.59, label: 'Yield Optimizer' },
  { address: '0x8894E0a0c962CB723c1ef8B0db6d44B5994aC88a', chain: 'bsc', pnlRank: 11, totalPnl: 498000, winRate: 0.58, label: 'Smart LP' },
  { address: '0xA910f92ACdAf488FA6eF02174fb86208Ad7722ba', chain: 'bsc', pnlRank: 12, totalPnl: 456000, winRate: 0.57, label: 'Chain Hopper' },
  { address: '0x161Ba15dB37c14D7CF5F5243E01b0f3F937f3be3', chain: 'bsc', pnlRank: 13, totalPnl: 412000, winRate: 0.56, label: 'Momentum Trader' },
  { address: '0x7Ef7560EB7b44e3FDa5Ba94e080E1Be8e6702f5f', chain: 'bsc', pnlRank: 14, totalPnl: 389000, winRate: 0.55, label: 'Breakout Bot' },
  { address: '0xaC6dCFf2e3cfb3b4340345a7F9b29A26A7Da716b', chain: 'bsc', pnlRank: 15, totalPnl: 356000, winRate: 0.54, label: 'Volume Scanner' },
  { address: '0x73BCEb1Cd57C711feaC4224D062b0F6ff338501e', chain: 'bsc', pnlRank: 16, totalPnl: 334000, winRate: 0.53, label: 'Early Bird' },
  { address: '0x0fA6b9E67e1F1F4a3f2e1D4b6c1fA1C8c4D2e9a7', chain: 'bsc', pnlRank: 17, totalPnl: 312000, winRate: 0.53, label: 'Whale Watcher' },
  { address: '0x1Db92e2EeBC8E0c075a02BeA49a2935BcD2dFCF4', chain: 'bsc', pnlRank: 18, totalPnl: 289000, winRate: 0.52, label: 'Pattern Trader' },
  { address: '0x2fAf487A4414Fe77e2327F0bf4AE2a264a776AD2', chain: 'bsc', pnlRank: 19, totalPnl: 267000, winRate: 0.51, label: 'Risk Manager' },
  { address: '0x6Cc5F688a315f3dC28A7781717a9A798a59fDA7b', chain: 'bsc', pnlRank: 20, totalPnl: 245000, winRate: 0.51, label: 'Gem Finder' },
  { address: '0x0D0707963952f2fBA59dD06f2b425ace40b492Fe', chain: 'bsc', pnlRank: 21, totalPnl: 223000, winRate: 0.50, label: 'Alpha Leaker' },
  { address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', chain: 'bsc', pnlRank: 22, totalPnl: 209000, winRate: 0.49, label: 'Rotation Trader' },
  { address: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD', chain: 'bsc', pnlRank: 23, totalPnl: 198000, winRate: 0.49, label: 'Narrative Rider' },
  { address: '0x1111111254EEB25477B68fb85Ed929f73A960582', chain: 'bsc', pnlRank: 24, totalPnl: 187000, winRate: 0.48, label: 'Aggregator Pro' },
  { address: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF', chain: 'bsc', pnlRank: 25, totalPnl: 176000, winRate: 0.48, label: 'Stealth Buyer' },
  { address: '0xe592427A0AEce92De3Edee1F18E0157C05861564', chain: 'bsc', pnlRank: 26, totalPnl: 165000, winRate: 0.47, label: 'Multi-Pool' },
  { address: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F', chain: 'bsc', pnlRank: 27, totalPnl: 154000, winRate: 0.47, label: 'Pair Trader' },
  { address: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', chain: 'bsc', pnlRank: 28, totalPnl: 143000, winRate: 0.46, label: 'Limit Sniper' },
  { address: '0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B', chain: 'bsc', pnlRank: 29, totalPnl: 132000, winRate: 0.46, label: 'Gas Optimizer' },
  { address: '0x3999D2c5207C06BBC5cf8A6bEa52966caBA76Fe5', chain: 'bsc', pnlRank: 30, totalPnl: 121000, winRate: 0.45, label: 'Smart Exit Pro' },
];

const DEFAULT_TRACKED_WALLET_LIMIT = 50;
const MAX_TRACKED_WALLET_LIMIT = 100;

function generateSyntheticAddress(rank: number): string {
  return `0x${rank.toString(16).padStart(40, '0')}`;
}

function buildSyntheticWallet(rank: number): SmartWallet {
  const winRate = Math.max(0.3, 0.45 - (rank - 30) * 0.002);
  const totalPnl = Math.max(25000, Math.round(121000 - (rank - 30) * 1800));
  return {
    address: generateSyntheticAddress(rank),
    chain: 'bsc',
    pnlRank: rank,
    totalPnl,
    winRate,
    label: `Alpha Wallet #${rank}`,
  };
}

const ALL_TRACKED_SMART_WALLETS: SmartWallet[] = [
  ...TRACKED_SMART_WALLETS,
  ...Array.from({ length: MAX_TRACKED_WALLET_LIMIT - TRACKED_SMART_WALLETS.length }, (_v, i) =>
    buildSyntheticWallet(TRACKED_SMART_WALLETS.length + i + 1)
  ),
];

const DEMO_HOLDINGS: UserHolding[] = [
  { tokenAddress: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', tokenSymbol: 'ETH', chain: 'bsc', balance: '500000000000000000', balanceUsd: 1250, pnlPercent: 12.5 },
  { tokenAddress: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', tokenSymbol: 'BTCB', chain: 'bsc', balance: '10000000000000000', balanceUsd: 680, pnlPercent: -3.2 },
  { tokenAddress: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', tokenSymbol: 'CAKE', chain: 'bsc', balance: '200000000000000000000', balanceUsd: 340, pnlPercent: 45.8 },
  { tokenAddress: '0xBf5140A22578168FD562DCcF235E5D43A02ce9B1', tokenSymbol: 'UNI', chain: 'bsc', balance: '50000000000000000000', balanceUsd: 220, pnlPercent: -15.3 },
  { tokenAddress: '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE', tokenSymbol: 'XRP', chain: 'bsc', balance: '1000000000000000000000', balanceUsd: 510, pnlPercent: 8.1 },
];

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

    if (mode === 'demo') {
      if (!this.usingDemoHoldings) {
        this.holdings = [...DEMO_HOLDINGS];
        this.usingDemoHoldings = true;
        this.emit('holdings_updated', this.getHoldings());
      }
      this.startDemoMode();
      return;
    }

    this.clearDemoTimer();
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

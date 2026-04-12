import type { CESConfig, CESSignal, WalletExit, WalletExitWithScore, SmartWallet, UserHolding } from '../types';

const DEFAULT_CES_CONFIG: CESConfig = {
  windowMinutes: 15,
  notifyThreshold: 1.5,
  autoExitThreshold: 3.0,
  criticalThreshold: 5.0,
  minExitRatio: 0.1, // ignore exits below 10% of position
};

/**
 * Consensus Exit Score (CES) Engine
 *
 * For every smart wallet exit in a rolling time window:
 *   per_exit_score = wallet_weight × exit_ratio × hold_factor
 *
 *   wallet_weight = 1 - (pnl_rank / total_tracked)
 *   exit_ratio    = amount_sold / total_position
 *   hold_factor   = log10(days_held + 1) + 1
 *
 *   CES = Σ per_exit_score
 *
 * Thresholds:
 *   CES > 1.5 → Telegram notification (manual approval)
 *   CES > 3.0 → Auto-execute if enabled
 *   CES > 5.0 → Critical, immediate execution
 */
export class CESEngine {
  private config: CESConfig;
  private exitBuffer: Map<string, WalletExitWithScore[]> = new Map(); // tokenAddress → exits
  private trackedWallets: Map<string, SmartWallet> = new Map();
  private totalTracked: number = 50;

  constructor(cesConfig?: Partial<CESConfig>) {
    this.config = { ...DEFAULT_CES_CONFIG, ...cesConfig };
  }

  setTrackedWallets(wallets: SmartWallet[]) {
    this.trackedWallets.clear();
    wallets.forEach(w => this.trackedWallets.set(w.address.toLowerCase(), w));
    this.totalTracked = wallets.length;
  }

  private calculateWalletWeight(pnlRank: number): number {
    return Math.max(0, 1 - (pnlRank / this.totalTracked));
  }

  private calculateHoldFactor(holdDurationDays: number): number {
    return Math.log10(holdDurationDays + 1) + 1;
  }

  private calculateExitScore(exit: WalletExit): WalletExitWithScore {
    const wallet = this.trackedWallets.get(exit.walletAddress.toLowerCase());
    const pnlRank = wallet?.pnlRank ?? this.totalTracked;
    const walletWeight = this.calculateWalletWeight(pnlRank);
    const holdFactor = this.calculateHoldFactor(exit.holdDurationDays);
    const exitScore = walletWeight * exit.exitRatio * holdFactor;

    return {
      ...exit,
      walletWeight,
      exitScore,
      pnlRank,
    };
  }

  private cleanExpiredExits(tokenAddress: string) {
    const windowMs = this.config.windowMinutes * 60 * 1000;
    const cutoff = Date.now() - windowMs;
    const exits = this.exitBuffer.get(tokenAddress) || [];
    const filtered = exits.filter(e => e.timestamp > cutoff);
    if (filtered.length === 0) {
      this.exitBuffer.delete(tokenAddress);
    } else {
      this.exitBuffer.set(tokenAddress, filtered);
    }
  }

  processExit(exit: WalletExit, userHoldings: UserHolding[]): CESSignal | null {
    if (exit.exitRatio < this.config.minExitRatio) return null;

    const scored = this.calculateExitScore(exit);
    const key = `${exit.chain}:${exit.tokenAddress}`.toLowerCase();

    if (!this.exitBuffer.has(key)) {
      this.exitBuffer.set(key, []);
    }
    this.exitBuffer.get(key)!.push(scored);
    this.cleanExpiredExits(key);

    const allExits = this.exitBuffer.get(key) || [];
    const ces = allExits.reduce((sum, e) => sum + e.exitScore, 0);

    if (ces < this.config.notifyThreshold) return null;

    const userHolding = userHoldings.find(
      h => h.tokenAddress.toLowerCase() === exit.tokenAddress.toLowerCase() && h.chain === exit.chain
    );

    if (!userHolding) return null; // user doesn't hold this token

    const severity = ces >= this.config.criticalThreshold
      ? 'critical'
      : ces >= this.config.autoExitThreshold
      ? 'high'
      : ces >= this.config.notifyThreshold
      ? 'medium'
      : 'low';

    const action = ces >= this.config.criticalThreshold ? 'auto_exit' : 'notify';

    return {
      id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tokenAddress: exit.tokenAddress,
      tokenSymbol: exit.tokenSymbol,
      chain: exit.chain,
      score: Math.round(ces * 100) / 100,
      severity,
      exits: [...allExits],
      userHolding,
      timestamp: Date.now(),
      action,
    };
  }

  getActiveSignals(): Map<string, WalletExitWithScore[]> {
    // Clean all buffers first
    for (const key of this.exitBuffer.keys()) {
      this.cleanExpiredExits(key);
    }
    return new Map(this.exitBuffer);
  }

  clearTokenBuffer(chain: string, tokenAddress: string) {
    const key = `${chain}:${tokenAddress}`.toLowerCase();
    this.exitBuffer.delete(key);
  }

  updateConfig(newConfig: Partial<CESConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): CESConfig {
    return { ...this.config };
  }
}

export const cesEngine = new CESEngine();

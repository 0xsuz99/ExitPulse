import { Bot, InlineKeyboard } from 'grammy';
import { config } from '../config';
import { signalDetector } from './signalDetector';
import { demoSessionManager } from './demoSessionManager';
import { loadPersistedConfig, savePersistedConfig } from './persistence';
import type { CESSignal, TelegramApproval, WsEvent } from '../types';

interface TelegramStatus {
  configured: boolean;
  botUsername: string | null;
  linkedChatCount: number;
  linked: boolean;
}

class TelegramBotService {
  private bot: Bot | null = null;
  private botUsername: string | null = null;
  private botToken: string;
  private pendingApprovals: Map<string, TelegramApproval & { sessionId?: string; tokenAddress?: string; chain?: string }> = new Map();
  private linkedChatIds: Set<string> = new Set();
  private pendingLinkCodes: Map<string, { createdAt: number }> = new Map();
  private signalListenerBound = false;
  // Recent signals cache for /signals command (works across demo + live)
  private recentSignals: CESSignal[] = [];
  private activeDemoSessionId: string | null = null;

  constructor() {
    // Load persisted config first, fall back to .env
    const persisted = loadPersistedConfig();
    this.botToken = persisted.telegramBotToken || config.telegram.botToken;

    // Restore linked chat ID if persisted
    if (persisted.telegramChatId) {
      this.linkedChatIds.add(persisted.telegramChatId);
      signalDetector.updateUserConfig({ telegramChatId: persisted.telegramChatId });
    }
  }

  private readonly onSignal = (signal: CESSignal) => {
    if (signalDetector.getUserConfig().runtimeMode === 'demo') {
      return;
    }
    void this.sendSignalNotification(signal);
  };

  private readonly onSignalUpdated = (signal: CESSignal) => {
    if (signalDetector.getUserConfig().runtimeMode === 'demo') {
      return;
    }
    this.upsertRecentSignal(signal);
    void this.syncApprovalFromSignal(signal);
  };

  private readonly onSignalRemoved = (data: { signalId?: string }) => {
    if (signalDetector.getUserConfig().runtimeMode === 'demo') {
      return;
    }
    if (!data?.signalId) return;
    void this.resolvePendingApproval(data.signalId, 'DISMISSED IN APP - removed from feed.', 'rejected');
  };

  private readonly onDemoSessionEvent = ({ sessionId, event }: { sessionId: string; event: WsEvent }) => {
    const userConfig = signalDetector.getUserConfig();
    if (userConfig.runtimeMode !== 'demo') return;
    if (!this.activeDemoSessionId || sessionId !== this.activeDemoSessionId) return;

    if (event.type === 'signal') {
      const signal = event.data as CESSignal;
      const existed = this.upsertRecentSignal(signal);
      if (existed) {
        void this.syncApprovalFromSignal(signal, sessionId);
        return;
      }
      void this.sendSignalNotification(signal, sessionId);
      return;
    }

    if (event.type === 'signal_removed' && event.data?.signalId) {
      void this.resolvePendingApproval(
        event.data.signalId,
        'DISMISSED IN APP - removed from feed.',
        'rejected',
        sessionId
      );
    }
  };

  private upsertRecentSignal(signal: CESSignal): boolean {
    const existing = this.recentSignals.findIndex(s => s.id === signal.id);
    if (existing >= 0) {
      this.recentSignals[existing] = signal;
      return true;
    }
    this.recentSignals.unshift(signal);
    if (this.recentSignals.length > 20) this.recentSignals.pop();
    return false;
  }

  private approvalKey(signalId: string, sessionId?: string) {
    return sessionId ? `${sessionId}::${signalId}` : signalId;
  }

  private isTokenFormatValid(token: string): boolean {
    return /^\d+:[A-Za-z0-9_-]{20,}$/.test(token);
  }

  private bindSignalListener() {
    if (this.signalListenerBound) return;
    signalDetector.on('signal', this.onSignal);
    signalDetector.on('signal_updated', this.onSignalUpdated);
    signalDetector.on('signal_removed', this.onSignalRemoved);
    demoSessionManager.on('session_event', this.onDemoSessionEvent);
    this.signalListenerBound = true;
  }

  private shortHash(txHash?: string): string {
    if (!txHash) return 'pending';
    if (txHash.length <= 14) return txHash;
    return `${txHash.slice(0, 8)}...${txHash.slice(-6)}`;
  }

  private async resolvePendingApproval(
    signalId: string,
    resolutionText: string,
    status: TelegramApproval['status'],
    sessionId?: string
  ) {
    const approvalKey = this.approvalKey(signalId, sessionId);
    const fallbackKey = this.approvalKey(signalId);
    const key = this.pendingApprovals.has(approvalKey) ? approvalKey : fallbackKey;
    const approval = this.pendingApprovals.get(key);
    if (!approval || !this.bot) return;

    this.pendingApprovals.set(key, { ...approval, status });

    const baseText = approval.messageText || `Signal ${signalId}`;
    const finalText = `${baseText}\n\n${resolutionText}`;

    try {
      if (approval.messageId) {
        await this.bot.api.editMessageText(approval.chatId, approval.messageId, finalText);
      } else {
        await this.bot.api.sendMessage(approval.chatId, finalText);
      }
    } catch {
      try {
        await this.bot.api.sendMessage(approval.chatId, resolutionText);
      } catch {
        // no-op
      }
    }

    this.pendingApprovals.delete(key);
  }

  private async syncApprovalFromSignal(signal: CESSignal, sessionId?: string) {
    const approvalKey = this.approvalKey(signal.id, sessionId);
    const fallbackKey = this.approvalKey(signal.id);
    const key = this.pendingApprovals.has(approvalKey) ? approvalKey : fallbackKey;
    const approval = this.pendingApprovals.get(key);
    if (!approval) return;
    if (signal.executionSource === 'telegram') return;

    if (signal.executionStatus === 'executed') {
      await this.resolvePendingApproval(
        signal.id,
        `APPROVED IN APP - exit executed (${this.shortHash(signal.executionTxHash)}).`,
        'approved',
        approval.sessionId
      );
      return;
    }

    if (signal.executionStatus === 'failed') {
      const reason = signal.executionError ? ` Reason: ${signal.executionError}` : '';
      await this.resolvePendingApproval(
        signal.id,
        `APPROVAL ATTEMPT FAILED IN APP.${reason}`,
        'expired',
        approval.sessionId
      );
    }
  }

  async start(tokenOverride?: string) {
    if (typeof tokenOverride === 'string') {
      this.botToken = tokenOverride.trim();
    }

    if (!this.botToken) {
      console.log('[Telegram] Bot token is not configured');
      this.botUsername = null;
      return;
    }

    if (this.bot) return;

    this.bot = new Bot(this.botToken);

    this.bot.command('start', async (ctx) => {
      const chatId = ctx.chat.id.toString();
      const text = ctx.message?.text || '';
      const linkCode = text.split(' ')[1]?.trim();

      if (linkCode) {
        if (!this.pendingLinkCodes.has(linkCode)) {
          await ctx.reply('Invalid or expired link code. Generate a fresh code in ExitPulse.');
          return;
        }
        this.pendingLinkCodes.delete(linkCode);
      }

      this.linkedChatIds.add(chatId);
      signalDetector.updateUserConfig({ telegramChatId: chatId });
      savePersistedConfig({ telegramChatId: chatId });

      await ctx.reply(
        'ExitPulse connected.\n\n' +
          'Commands:\n' +
          '/status - View current monitoring status\n' +
          '/holdings - View your tracked holdings\n' +
          '/signals - View recent signals\n' +
          '/mode - Toggle auto/manual exit mode'
      );

      console.log(`[Telegram] Chat linked: ${chatId}`);
    });

    this.bot.command('status', async (ctx) => {
      const userConfig = signalDetector.getUserConfig();
      const signals = signalDetector.getSignals();
      const recentSignals = signals.filter(s => Date.now() - s.timestamp < 3600000);

      await ctx.reply(
        'ExitPulse Status\n\n' +
          `Mode: ${userConfig.mode === 'auto' ? 'Auto' : 'Manual'}\n` +
          `Runtime: ${userConfig.runtimeMode.toUpperCase()}\n` +
          `Chain: ${userConfig.chain.toUpperCase()}\n` +
          `Tracked Wallets: ${userConfig.trackedWallets.length}\n` +
          `Signals (1h): ${recentSignals.length}`
      );
    });

    this.bot.command('holdings', async (ctx) => {
      const holdings = signalDetector.getHoldings();
      if (!holdings.length) {
        await ctx.reply('No holdings found. Connect your wallet in ExitPulse to sync live holdings.');
        return;
      }

      const lines = holdings.map(h => {
        const pnl = `${h.pnlPercent >= 0 ? '+' : ''}${h.pnlPercent.toFixed(1)}%`;
        return `${h.tokenSymbol} - $${h.balanceUsd.toFixed(2)} (${pnl})`;
      });

      const totalUsd = holdings.reduce((sum, h) => sum + h.balanceUsd, 0);
      await ctx.reply(`Your Holdings\n\n${lines.join('\n')}\n\nTotal: $${totalUsd.toFixed(2)}`);
    });

    this.bot.command('signals', async (ctx) => {
      // In live mode read from signalDetector; in demo mode use cached signals
      const liveSignals = signalDetector.getSignals();
      const signals = liveSignals.length > 0 ? liveSignals : this.recentSignals;

      if (!signals.length) {
        await ctx.reply('No active signals right now. Signals appear when tracked wallets start exiting tokens you hold.');
        return;
      }

      const lines = signals.slice(0, 8).map(s => {
        const sevEmoji = s.severity === 'critical' ? '🔴' : s.severity === 'high' ? '🟠' : '🟡';
        const status = s.executionStatus === 'executed' ? ' ✅' : s.executionStatus === 'executing' ? ' ⏳' : '';
        return `${sevEmoji} ${s.tokenSymbol} — CES ${s.score} (${s.severity})${status}`;
      });

      await ctx.reply(`Active Signals\n\n${lines.join('\n')}\n\n${signals.length > 8 ? `+${signals.length - 8} more...` : ''}`);
    });

    this.bot.command('mode', async (ctx) => {
      const current = signalDetector.getUserConfig().mode;
      const nextMode = current === 'auto' ? 'manual' : 'auto';
      signalDetector.updateUserConfig({ mode: nextMode as 'auto' | 'manual' });
      await ctx.reply(`Mode switched to ${nextMode === 'auto' ? 'Auto Exit' : 'Manual Approval'}.`);
    });

    this.bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;
      const [action, signalId, callbackSessionId] = data.split(':');
      const primaryKey = this.approvalKey(signalId, callbackSessionId);
      const fallbackKey = this.approvalKey(signalId);
      const approval = this.pendingApprovals.get(primaryKey) || this.pendingApprovals.get(fallbackKey);
      const userConfig = signalDetector.getUserConfig();

      let signal = signalDetector.getSignalById(signalId);
      const effectiveDemoSessionId = approval?.sessionId || callbackSessionId || this.activeDemoSessionId || undefined;
      if (userConfig.runtimeMode === 'demo') {
        signal = demoSessionManager.getSignalById(effectiveDemoSessionId, signalId, userConfig);
        if (!signal && approval?.tokenAddress) {
          signal = demoSessionManager.findSignalByToken(
            effectiveDemoSessionId,
            approval.tokenAddress,
            userConfig,
            approval.chain
          );
        }
      }

      if (!approval) {
        if (!signal) {
          await ctx.answerCallbackQuery({ text: 'This signal was already dismissed in ExitPulse.' });
          return;
        }
        if (signal.executionStatus === 'executed') {
          await ctx.answerCallbackQuery({ text: 'Already approved/executed in ExitPulse.' });
          return;
        }
        await ctx.answerCallbackQuery({ text: 'This approval has expired.' });
        return;
      }

      if (action === 'approve') {
        if (!signal) {
          this.pendingApprovals.delete(primaryKey);
          this.pendingApprovals.delete(fallbackKey);
          await ctx.answerCallbackQuery({ text: 'Signal already dismissed in app.' });
          await ctx.editMessageText((ctx.callbackQuery.message?.text || '') + '\n\nDISMISSED IN APP - no action taken.');
          return;
        }

        if (signal.executionStatus === 'executed' && signal.executionSource !== 'telegram') {
          this.pendingApprovals.delete(primaryKey);
          this.pendingApprovals.delete(fallbackKey);
          await ctx.answerCallbackQuery({ text: 'Already approved/executed in app.' });
          await ctx.editMessageText((ctx.callbackQuery.message?.text || '') + '\n\nAPPROVED IN APP - already executed.');
          return;
        }

        approval.status = 'approved';
        this.pendingApprovals.set(
          this.approvalKey(approval.signalId, approval.sessionId),
          approval
        );
        if (userConfig.runtimeMode !== 'live') {
          await ctx.answerCallbackQuery({ text: 'Demo approval received' });
          await ctx.editMessageText((ctx.callbackQuery.message?.text || '') + '\n\nAPPROVED - simulating exit...');

          const result = await demoSessionManager.simulateExit(
            effectiveDemoSessionId,
            signal.id,
            'telegram',
            userConfig
          );
          if (result.success) {
            await ctx.reply(`Demo exit simulated for ${signal.tokenSymbol}. Simulated tx: ${result.txHash}`);
          } else {
            await ctx.reply(`Demo exit failed for ${signal.tokenSymbol}. Reason: ${result.error}`);
          }
          this.pendingApprovals.delete(primaryKey);
          this.pendingApprovals.delete(fallbackKey);
          return;
        }

        if (userConfig.mode === 'manual') {
          await ctx.answerCallbackQuery({ text: 'Manual mode uses wallet signing from dashboard.' });
          await ctx.editMessageText((ctx.callbackQuery.message?.text || '') + '\n\nMANUAL MODE - sign from dashboard wallet.');
          this.pendingApprovals.delete(primaryKey);
          this.pendingApprovals.delete(fallbackKey);
          return;
        }

        await ctx.answerCallbackQuery({ text: 'Exit approved' });
        await ctx.editMessageText((ctx.callbackQuery.message?.text || '') + '\n\nAPPROVED - executing exit...');

        const result = await signalDetector.executeSignal(signal, 'telegram');
        if (result.success) {
          await ctx.reply(`Exit executed for ${signal.tokenSymbol}. Tx: ${result.txHash || 'pending'}`);
        } else {
          await ctx.reply(`Exit failed for ${signal.tokenSymbol}. Error: ${result.error}`);
        }
        this.pendingApprovals.delete(primaryKey);
        this.pendingApprovals.delete(fallbackKey);
      }

      if (action === 'reject') {
        approval.status = 'rejected';
        this.pendingApprovals.delete(primaryKey);
        this.pendingApprovals.delete(fallbackKey);
        if (userConfig.runtimeMode === 'demo') {
          demoSessionManager.dismissSignal(effectiveDemoSessionId, signalId, userConfig);
        } else {
          signalDetector.dismissSignal(signalId);
        }

        await ctx.answerCallbackQuery({ text: 'Exit rejected' });
        await ctx.editMessageText((ctx.callbackQuery.message?.text || '') + '\n\nREJECTED - removed from feed.');
      }
    });

    try {
      await this.bot.init();
      this.botUsername = this.bot.botInfo?.username || null;
      this.bindSignalListener();
      this.bot.start();
      console.log('[Telegram] Bot started');
    } catch (err: any) {
      console.error('[Telegram] Failed to start bot:', err.message);
      this.bot = null;
      throw err;
    }
  }

  async configureBotToken(botToken: string): Promise<{ botUsername: string | null }> {
    const cleanedToken = botToken.trim();

    if (!cleanedToken) {
      throw new Error('Telegram bot token is required');
    }

    if (!this.isTokenFormatValid(cleanedToken)) {
      throw new Error('Telegram bot token format looks invalid');
    }

    const needsRestart = this.botToken !== cleanedToken || !this.bot;
    this.botToken = cleanedToken;
    savePersistedConfig({ telegramBotToken: cleanedToken });

    if (needsRestart) {
      this.stop();
      await this.start(cleanedToken);
    }

    return { botUsername: this.getBotUsername() };
  }

  generateLinkCode(): string {
    // Invalidate all previous codes
    this.pendingLinkCodes.clear();

    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    this.pendingLinkCodes.set(code, { createdAt: Date.now() });
    setTimeout(() => this.pendingLinkCodes.delete(code), 600000);
    return code;
  }

  getBotUsername(): string | null {
    return this.botUsername;
  }

  getStatus(): TelegramStatus {
    const userConfig = signalDetector.getUserConfig();
    return {
      configured: Boolean(this.bot),
      botUsername: this.getBotUsername(),
      linkedChatCount: this.linkedChatIds.size,
      linked: Boolean(userConfig.telegramChatId),
    };
  }

  setActiveDemoSession(sessionId?: string) {
    if (!sessionId) return;
    this.activeDemoSessionId = sessionId;
  }

  disconnectLinkedChat(chatId?: string) {
    const activeChatId = chatId || signalDetector.getUserConfig().telegramChatId;
    if (activeChatId) {
      this.linkedChatIds.delete(activeChatId);
    }
    signalDetector.updateUserConfig({ telegramChatId: undefined });
    savePersistedConfig({ telegramChatId: undefined });
  }

  resetBotConfiguration() {
    this.stop();
    this.botToken = '';
    this.pendingApprovals.clear();
    this.pendingLinkCodes.clear();
    this.activeDemoSessionId = null;
    this.disconnectLinkedChat();
  }

  stop() {
    this.bot?.stop();
    this.bot = null;
    this.botUsername = null;
    this.pendingApprovals.clear();
  }

  async sendSignalNotification(signal: CESSignal, demoSessionId?: string) {
    this.upsertRecentSignal(signal);

    if (!this.bot) return;

    const chatId = signalDetector.getUserConfig().telegramChatId;
    if (!chatId) return;

    const exitDetails = signal.exits
      .slice(0, 5)
      .map(e => `- Rank #${e.pnlRank} exited ${(e.exitRatio * 100).toFixed(0)}% (held ${e.holdDurationDays}d)`)
      .join('\n');

    const message =
      `EXIT SIGNAL - ${signal.tokenSymbol}\n\n` +
      `CES Score: ${signal.score} (${signal.severity.toUpperCase()})\n` +
      `Chain: ${signal.chain.toUpperCase()}\n` +
      `Your holding: $${signal.userHolding?.balanceUsd.toFixed(0)}\n` +
      `PnL: ${(signal.userHolding?.pnlPercent ?? 0) >= 0 ? '+' : ''}${signal.userHolding?.pnlPercent.toFixed(1)}%\n\n` +
      `Smart wallet exits:\n${exitDetails}\n\n` +
      `${signal.exits.length} wallet(s) exiting in the last 15 min`;

    const userConfig = signalDetector.getUserConfig();
    const userMode = userConfig.mode;
    const isDemo = userConfig.runtimeMode !== 'live';
    const modeTag = isDemo ? '\n[DEMO MODE]' : '';
    const effectiveSessionId = isDemo ? (demoSessionId || this.activeDemoSessionId || undefined) : undefined;

    if (isDemo && userMode === 'manual') {
      await this.bot.api.sendMessage(
        chatId,
        `${message}${modeTag}\n\nManual mode: open ExitPulse dashboard and click "Simulate + Sign" (demo) or "Sign Exit in Wallet" (live).`
      );
      return;
    }

    if (isDemo && userMode === 'auto' && signal.action === 'notify') {
      const approveData = effectiveSessionId
        ? `approve:${signal.id}:${effectiveSessionId}`
        : `approve:${signal.id}`;
      const rejectData = effectiveSessionId
        ? `reject:${signal.id}:${effectiveSessionId}`
        : `reject:${signal.id}`;
      const keyboard = new InlineKeyboard()
        .text('Approve Exit', approveData)
        .text('Ignore', rejectData);

      const sent = await this.bot.api.sendMessage(
        chatId,
        `${message}${modeTag}\n\nAuto mode: this signal is non-critical. Approve to simulate an early exit, or ignore to keep monitoring.`,
        { reply_markup: keyboard }
      );

      this.pendingApprovals.set(this.approvalKey(signal.id, effectiveSessionId), {
        signalId: signal.id,
        chatId,
        messageId: sent.message_id,
        messageText: `${message}${modeTag}\n\nAuto mode: this signal is non-critical. Approve to simulate an early exit, or ignore to keep monitoring.`,
        status: 'pending',
        createdAt: Date.now(),
        sessionId: effectiveSessionId,
        tokenAddress: signal.tokenAddress,
        chain: signal.chain,
      });
      return;
    }

    if (isDemo) {
      await this.bot.api.sendMessage(
        chatId,
        `${message}${modeTag}\n\nExecution is simulated in demo mode. Switch to Live mode for real orders.`
      );
      return;
    }

    if (userMode === 'manual') {
      await this.bot.api.sendMessage(
        chatId,
        `${message}\n\nManual mode: open ExitPulse dashboard and click "Sign Exit in Wallet" to approve in your wallet.`
      );
      return;
    }

    if (signal.action === 'notify') {
      const keyboard = new InlineKeyboard()
        .text('Approve Exit', `approve:${signal.id}`)
        .text('Ignore', `reject:${signal.id}`);

      const sent = await this.bot.api.sendMessage(chatId, `${message}${modeTag}`, {
        reply_markup: keyboard,
      });

      this.pendingApprovals.set(this.approvalKey(signal.id), {
        signalId: signal.id,
        chatId,
        messageId: sent.message_id,
        messageText: `${message}${modeTag}`,
        status: 'pending',
        createdAt: Date.now(),
      });
      return;
    }

    await this.bot.api.sendMessage(chatId, `${message}\n\nAuto-executing exit...`);
  }
}

export const telegramBot = new TelegramBotService();

import { Bot, InlineKeyboard } from 'grammy';
import { config } from '../config';
import { signalDetector } from './signalDetector';
import { loadPersistedConfig, savePersistedConfig } from './persistence';
import type { CESSignal, TelegramApproval } from '../types';

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
  private pendingApprovals: Map<string, TelegramApproval> = new Map();
  private linkedChatIds: Set<string> = new Set();
  private pendingLinkCodes: Map<string, { createdAt: number }> = new Map();
  private signalListenerBound = false;

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
    this.sendSignalNotification(signal);
  };

  private readonly onSignalUpdated = (signal: CESSignal) => {
    void this.syncApprovalFromSignal(signal);
  };

  private readonly onSignalRemoved = (data: { signalId?: string }) => {
    if (!data?.signalId) return;
    void this.resolvePendingApproval(data.signalId, 'DISMISSED IN APP - removed from feed.', 'rejected');
  };

  private isTokenFormatValid(token: string): boolean {
    return /^\d+:[A-Za-z0-9_-]{20,}$/.test(token);
  }

  private bindSignalListener() {
    if (this.signalListenerBound) return;
    signalDetector.on('signal', this.onSignal);
    signalDetector.on('signal_updated', this.onSignalUpdated);
    signalDetector.on('signal_removed', this.onSignalRemoved);
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
    status: TelegramApproval['status']
  ) {
    const approval = this.pendingApprovals.get(signalId);
    if (!approval || !this.bot) return;

    this.pendingApprovals.set(signalId, { ...approval, status });

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

    this.pendingApprovals.delete(signalId);
  }

  private async syncApprovalFromSignal(signal: CESSignal) {
    const approval = this.pendingApprovals.get(signal.id);
    if (!approval) return;
    if (signal.executionSource === 'telegram') return;

    if (signal.executionStatus === 'executed') {
      await this.resolvePendingApproval(
        signal.id,
        `APPROVED IN APP - exit executed (${this.shortHash(signal.executionTxHash)}).`,
        'approved'
      );
      return;
    }

    if (signal.executionStatus === 'failed') {
      const reason = signal.executionError ? ` Reason: ${signal.executionError}` : '';
      await this.resolvePendingApproval(
        signal.id,
        `APPROVAL ATTEMPT FAILED IN APP.${reason}`,
        'expired'
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

    this.bot.command('mode', async (ctx) => {
      const current = signalDetector.getUserConfig().mode;
      const nextMode = current === 'auto' ? 'manual' : 'auto';
      signalDetector.updateUserConfig({ mode: nextMode as 'auto' | 'manual' });
      await ctx.reply(`Mode switched to ${nextMode === 'auto' ? 'Auto Exit' : 'Manual Approval'}.`);
    });

    this.bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;
      const [action, signalId] = data.split(':');
      const approval = this.pendingApprovals.get(signalId);
      const signal = signalDetector.getSignalById(signalId);

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
          this.pendingApprovals.delete(signalId);
          await ctx.answerCallbackQuery({ text: 'Signal already dismissed in app.' });
          await ctx.editMessageText((ctx.callbackQuery.message?.text || '') + '\n\nDISMISSED IN APP - no action taken.');
          return;
        }

        if (signal.executionStatus === 'executed' && signal.executionSource !== 'telegram') {
          this.pendingApprovals.delete(signalId);
          await ctx.answerCallbackQuery({ text: 'Already approved/executed in app.' });
          await ctx.editMessageText((ctx.callbackQuery.message?.text || '') + '\n\nAPPROVED IN APP - already executed.');
          return;
        }

        approval.status = 'approved';
        this.pendingApprovals.set(signalId, approval);

        const userConfig = signalDetector.getUserConfig();
        if (userConfig.runtimeMode !== 'live') {
          await ctx.answerCallbackQuery({ text: 'Demo approval received' });
          await ctx.editMessageText((ctx.callbackQuery.message?.text || '') + '\n\nAPPROVED - simulating exit...');

          const result = await signalDetector.simulateDemoExit(signal, 'telegram');
          if (result.success) {
            await ctx.reply(`Demo exit simulated for ${signal.tokenSymbol}. Simulated tx: ${result.txHash}`);
          } else {
            await ctx.reply(`Demo exit failed for ${signal.tokenSymbol}. Reason: ${result.error}`);
          }
          this.pendingApprovals.delete(signalId);
          return;
        }

        if (userConfig.mode === 'manual') {
          await ctx.answerCallbackQuery({ text: 'Manual mode uses wallet signing from dashboard.' });
          await ctx.editMessageText((ctx.callbackQuery.message?.text || '') + '\n\nMANUAL MODE - sign from dashboard wallet.');
          this.pendingApprovals.delete(signalId);
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
        this.pendingApprovals.delete(signalId);
      }

      if (action === 'reject') {
        approval.status = 'rejected';
        this.pendingApprovals.delete(signalId);
        signalDetector.dismissSignal(signalId);

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
    this.disconnectLinkedChat();
  }

  stop() {
    this.bot?.stop();
    this.bot = null;
    this.botUsername = null;
  }

  async sendSignalNotification(signal: CESSignal) {
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

    if (isDemo && userMode === 'manual') {
      await this.bot.api.sendMessage(
        chatId,
        `${message}${modeTag}\n\nManual mode: open ExitPulse dashboard and click "Simulate + Sign" (demo) or "Sign Exit in Wallet" (live).`
      );
      return;
    }

    if (isDemo && userMode === 'auto' && signal.action === 'notify') {
      const keyboard = new InlineKeyboard()
        .text('Approve Exit', `approve:${signal.id}`)
        .text('Ignore', `reject:${signal.id}`);

      const sent = await this.bot.api.sendMessage(
        chatId,
        `${message}${modeTag}\n\nAuto mode: this signal is non-critical. Approve to simulate an early exit, or ignore to keep monitoring.`,
        { reply_markup: keyboard }
      );

      this.pendingApprovals.set(signal.id, {
        signalId: signal.id,
        chatId,
        messageId: sent.message_id,
        messageText: `${message}${modeTag}\n\nAuto mode: this signal is non-critical. Approve to simulate an early exit, or ignore to keep monitoring.`,
        status: 'pending',
        createdAt: Date.now(),
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

      this.pendingApprovals.set(signal.id, {
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

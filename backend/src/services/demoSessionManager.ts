import { EventEmitter } from 'events';
import { DemoEngine } from './demoEngine';
import type { CESSignal, UserConfig, UserHolding, WsEvent } from '../types';

const SESSION_ID_FALLBACK = 'demo_default';
const SESSION_ID_MAX_LENGTH = 120;
const SESSION_IDLE_CLEANUP_MS = 2 * 60 * 1000;

interface DemoSession {
  id: string;
  engine: DemoEngine;
  clients: number;
  lastActiveAt: number;
  cleanupTimer: NodeJS.Timeout | null;
}

interface SessionEventPayload {
  sessionId: string;
  event: WsEvent;
}

function sanitizeSessionId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return SESSION_ID_FALLBACK;

  const normalized = trimmed.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, SESSION_ID_MAX_LENGTH);
  return normalized || SESSION_ID_FALLBACK;
}

export class DemoSessionManager extends EventEmitter {
  private readonly sessions: Map<string, DemoSession> = new Map();

  private scheduleIdleCleanup(session: DemoSession) {
    if (session.clients > 0 || session.cleanupTimer) return;

    session.cleanupTimer = setTimeout(() => {
      const latest = this.sessions.get(session.id);
      if (!latest) return;
      if (latest.clients > 0) {
        latest.cleanupTimer = null;
        return;
      }
      latest.engine.stop();
      this.sessions.delete(session.id);
    }, SESSION_IDLE_CLEANUP_MS);
  }

  normalizeSessionId(raw?: string | null): string {
    if (!raw) return SESSION_ID_FALLBACK;
    return sanitizeSessionId(raw);
  }

  attachClient(rawSessionId: string | undefined, userConfig: UserConfig): string {
    const sessionId = this.normalizeSessionId(rawSessionId);
    const session = this.ensureSession(sessionId, userConfig);

    if (session.cleanupTimer) {
      clearTimeout(session.cleanupTimer);
      session.cleanupTimer = null;
    }

    session.clients += 1;
    session.lastActiveAt = Date.now();
    return sessionId;
  }

  detachClient(rawSessionId: string | undefined) {
    const sessionId = this.normalizeSessionId(rawSessionId);
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.clients = Math.max(0, session.clients - 1);
    session.lastActiveAt = Date.now();

    this.scheduleIdleCleanup(session);
  }

  setExecutionModeForAll(mode: 'manual' | 'auto') {
    for (const session of this.sessions.values()) {
      session.engine.setExecutionMode(mode);
    }
  }

  syncAllFromUserConfig(userConfig: UserConfig) {
    for (const session of this.sessions.values()) {
      session.engine.setExecutionMode(userConfig.mode);
      session.engine.setTrackedWalletLimit(userConfig.trackedWalletLimit);
    }
  }

  stopAll() {
    for (const session of this.sessions.values()) {
      if (session.cleanupTimer) {
        clearTimeout(session.cleanupTimer);
      }
      session.engine.stop();
    }
    this.sessions.clear();
  }

  getSignals(rawSessionId: string | undefined, userConfig: UserConfig): CESSignal[] {
    return this.ensureSession(this.normalizeSessionId(rawSessionId), userConfig).engine.getSignals();
  }

  getSignalById(rawSessionId: string | undefined, signalId: string, userConfig: UserConfig): CESSignal | undefined {
    return this.ensureSession(this.normalizeSessionId(rawSessionId), userConfig).engine.getSignalById(signalId);
  }

  findSignalByToken(
    rawSessionId: string | undefined,
    tokenAddress: string,
    userConfig: UserConfig,
    chain?: string
  ): CESSignal | undefined {
    const session = this.ensureSession(this.normalizeSessionId(rawSessionId), userConfig);
    const targetToken = tokenAddress.toLowerCase();
    const targetChain = chain?.toLowerCase();

    return session.engine.getSignals().find(signal => {
      const tokenMatches = signal.tokenAddress.toLowerCase() === targetToken;
      if (!tokenMatches) return false;
      if (!targetChain) return true;
      return signal.chain.toLowerCase() === targetChain;
    });
  }

  dismissSignal(rawSessionId: string | undefined, signalId: string, userConfig: UserConfig): boolean {
    return this.ensureSession(this.normalizeSessionId(rawSessionId), userConfig).engine.dismissSignal(signalId);
  }

  simulateExit(
    rawSessionId: string | undefined,
    signalId: string,
    source: 'dashboard' | 'telegram' | 'auto',
    userConfig: UserConfig
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    return this.ensureSession(this.normalizeSessionId(rawSessionId), userConfig).engine.simulateExit(signalId, source);
  }

  getHoldings(rawSessionId: string | undefined, userConfig: UserConfig): UserHolding[] {
    return this.ensureSession(this.normalizeSessionId(rawSessionId), userConfig).engine.getHoldings();
  }

  getStats(rawSessionId: string | undefined, userConfig: UserConfig) {
    const session = this.ensureSession(this.normalizeSessionId(rawSessionId), userConfig);
    const signals = session.engine.getSignals();
    const holdings = session.engine.getHoldings();
    const status = session.engine.getStatus();
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    return {
      totalSignals: signals.length,
      signalsLastHour: signals.filter(signal => now - signal.timestamp < oneHour).length,
      criticalSignals: signals.filter(signal => signal.severity === 'critical' || signal.severity === 'high').length,
      trackedWallets: status.trackedWalletCount,
      holdingsCount: holdings.length,
      totalPortfolioUsd: holdings.reduce((sum, holding) => sum + holding.balanceUsd, 0),
      runtimeMode: 'demo' as const,
      demoHoldings: true,
      liveStreamConnected: true,
      liveStreamWatchlistCount: holdings.length,
      liveStreamMessages: status.signalsEmitted + status.signalUpdates,
    };
  }

  getLiveStatus(rawSessionId: string | undefined, userConfig: UserConfig) {
    const session = this.ensureSession(this.normalizeSessionId(rawSessionId), userConfig);
    const status = session.engine.getStatus();

    return {
      runtimeMode: 'demo' as const,
      connected: status.connected,
      connecting: false,
      streamUrl: 'simulated://session',
      reconnectAttempt: 0,
      activeSubscriptionCount: 0,
      watchlistCount: status.watchlistCount,
      watchedSymbols: status.watchedSymbols,
      trackedWalletCount: status.trackedWalletCount,
      messagesReceived: status.signalsEmitted,
      txEventsReceived: status.trackedWalletMatches,
      trackedWalletMatches: status.trackedWalletMatches,
      exitsEmitted: status.trackedWalletMatches,
      signalsEmitted: status.signalsEmitted,
      signalUpdates: status.signalUpdates,
      demoExecutions: status.demoExecutions,
      demoFailures: status.demoFailures,
      lastMessageAt: status.lastMessageAt,
      lastExitAt: status.lastExitAt,
      lastSignalAt: status.lastSignalAt,
      lastError: undefined,
    };
  }

  private ensureSession(sessionId: string, userConfig: UserConfig): DemoSession {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.engine.setExecutionMode(userConfig.mode);
      existing.engine.setTrackedWalletLimit(userConfig.trackedWalletLimit);
      existing.lastActiveAt = Date.now();
      this.scheduleIdleCleanup(existing);
      return existing;
    }

    const engine = new DemoEngine(
      (type: string, data: any) => {
        const wsEvent = {
          type: type as WsEvent['type'],
          data,
          timestamp: Date.now(),
        };
        this.emit('session_event', {
          sessionId,
          event: wsEvent,
        } as SessionEventPayload);
      },
      userConfig.mode,
      userConfig.trackedWalletLimit
    );

    engine.start();

    const session: DemoSession = {
      id: sessionId,
      engine,
      clients: 0,
      lastActiveAt: Date.now(),
      cleanupTimer: null,
    };

    this.sessions.set(sessionId, session);
    this.scheduleIdleCleanup(session);
    return session;
  }
}

export const demoSessionManager = new DemoSessionManager();

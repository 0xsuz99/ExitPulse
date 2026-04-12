import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { config } from './config';
import apiRoutes from './routes/api';
import { signalDetector } from './services/signalDetector';
import { telegramBot } from './services/telegramBot';
import { aveDataIngestion } from './services/aveDataIngestion';
import { demoSessionManager } from './services/demoSessionManager';
import type { CESSignal, WalletExit, WsEvent } from './types';

const app = express();
const server = http.createServer(app);

// ─── Middleware ───

const allowedOrigins = [
  config.server.frontendUrl,
  'http://localhost:5173',
  'http://localhost:4173',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, Railway health checks)
    if (!origin) return cb(null, true);
    if (allowedOrigins.some(o => origin.startsWith(o))) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json());

// ─── API Routes ───

app.use('/api', apiRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', demo: config.demoMode, uptime: process.uptime() });
});

// ─── WebSocket Server (for frontend real-time updates) ───

const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Set<WebSocket>();
const clientsBySession = new Map<string, Set<WebSocket>>();
const sessionBySocket = new Map<WebSocket, string>();

wss.on('connection', (ws, req) => {
  const requestUrl = new URL(req.url || '/ws', `http://${req.headers.host || 'localhost'}`);
  const requestedSessionId = requestUrl.searchParams.get('sid');
  const sessionId = demoSessionManager.normalizeSessionId(requestedSessionId);

  clients.add(ws);
  sessionBySocket.set(ws, sessionId);

  if (!clientsBySession.has(sessionId)) {
    clientsBySession.set(sessionId, new Set());
  }
  clientsBySession.get(sessionId)!.add(ws);

  if (signalDetector.getUserConfig().runtimeMode === 'demo') {
    demoSessionManager.attachClient(sessionId, signalDetector.getUserConfig());
  }

  console.log(`[WS] Client connected (${clients.size} total)`);

  // Send initial state
  const initEvent: WsEvent = {
    type: 'connection_status',
    data: { connected: true, demo: config.demoMode, sessionId },
    timestamp: Date.now(),
  };
  ws.send(JSON.stringify(initEvent));

  ws.on('close', () => {
    const socketSessionId = sessionBySocket.get(ws);
    sessionBySocket.delete(ws);

    if (socketSessionId) {
      const group = clientsBySession.get(socketSessionId);
      if (group) {
        group.delete(ws);
        if (group.size === 0) {
          clientsBySession.delete(socketSessionId);
        }
      }
      demoSessionManager.detachClient(socketSessionId);
    }

    clients.delete(ws);
    console.log(`[WS] Client disconnected (${clients.size} total)`);
  });
});

function broadcast(event: WsEvent) {
  const msg = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

function broadcastToSession(sessionId: string, event: WsEvent) {
  const group = clientsBySession.get(sessionId);
  if (!group || group.size === 0) return;

  const msg = JSON.stringify(event);
  for (const client of group) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

function isLiveRuntime() {
  return signalDetector.getUserConfig().runtimeMode === 'live';
}

demoSessionManager.on('session_event', ({ sessionId, event }: { sessionId: string; event: WsEvent }) => {
  if (!isLiveRuntime()) {
    broadcastToSession(sessionId, event);
  }
});

// ─── Signal Events → WebSocket Broadcast ───

signalDetector.on('signal', (signal: CESSignal) => {
  if (!isLiveRuntime()) return;
  broadcast({ type: 'signal', data: signal, timestamp: Date.now() });
});

signalDetector.on('exit', (exit: WalletExit) => {
  if (!isLiveRuntime()) return;
  broadcast({
    type: 'holdings_update',
    data: { exit, type: 'smart_wallet_exit' },
    timestamp: Date.now(),
  });
});

signalDetector.on('holdings_updated', (holdings: any) => {
  if (!isLiveRuntime()) return;
  broadcast({
    type: 'holdings_update',
    data: { holdings, type: 'portfolio_updated' },
    timestamp: Date.now(),
  });
});

signalDetector.on('exit_executed', (data: any) => {
  if (!isLiveRuntime()) return;
  broadcast({ type: 'exit_executed', data, timestamp: Date.now() });
});

signalDetector.on('exit_failed', (data: any) => {
  if (!isLiveRuntime()) return;
  broadcast({ type: 'exit_failed', data, timestamp: Date.now() });
});

signalDetector.on('signal_updated', (signal: CESSignal) => {
  if (!isLiveRuntime()) return;
  broadcast({ type: 'signal', data: signal, timestamp: Date.now() });
});

signalDetector.on('signal_removed', (data: { signalId: string }) => {
  if (!isLiveRuntime()) return;
  broadcast({ type: 'signal_removed', data, timestamp: Date.now() });
});

signalDetector.on('mode_changed', (data: any) => {
  broadcast({ type: 'mode_changed', data, timestamp: Date.now() });

  const runtimeMode = data?.runtimeMode as 'demo' | 'live' | undefined;
  if (runtimeMode === 'live') {
    demoSessionManager.stopAll();
    return;
  }

  if (runtimeMode === 'demo') {
    const userConfig = signalDetector.getUserConfig();
    for (const sessionId of clientsBySession.keys()) {
      demoSessionManager.attachClient(sessionId, userConfig);
    }
  }
});

// ─── Start ───

server.listen(config.server.port, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║         ⚡ ExitPulse Backend ⚡        ║');
  console.log('  ╠══════════════════════════════════════╣');
  console.log(`  ║  HTTP:  http://localhost:${config.server.port}          ║`);
  console.log(`  ║  WS:    ws://localhost:${config.server.port}/ws         ║`);
  console.log(`  ║  Mode:  ${config.demoMode ? 'DEMO (simulated)' : 'LIVE'}               ║`);
  console.log(`  ║  Chain: ${config.defaultChain.toUpperCase().padEnd(28)}║`);
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');

  // Start signal detection
  signalDetector.start();

  // Start Ave Data API live ingestion
  aveDataIngestion.start();
  aveDataIngestion.on('wallet_exit', (exit: WalletExit) => {
    signalDetector.processExit(exit);
  });

  // Start Telegram bot
  telegramBot.start().catch((err: any) => {
    console.error('[Telegram] Startup error:', err?.message || err);
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  aveDataIngestion.stop();
  signalDetector.stop();
  demoSessionManager.stopAll();
  telegramBot.stop();
  server.close();
  process.exit(0);
});

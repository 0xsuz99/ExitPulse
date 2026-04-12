import { Request, Router } from 'express';
import { signalDetector } from '../services/signalDetector';
import { aveTradeApi } from '../services/aveTradeApi';
import { aveDataIngestion } from '../services/aveDataIngestion';
import { cesEngine } from '../services/cesEngine';
import { telegramBot } from '../services/telegramBot';
import { demoSessionManager } from '../services/demoSessionManager';
import type { Chain, UserHolding } from '../types';

const router = Router();

const NATIVE_TOKEN_BY_CHAIN: Record<Chain, { address: string; symbol: string }> = {
  bsc: { address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'BNB' },
  eth: { address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'ETH' },
  base: { address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'ETH' },
  solana: { address: 'sol', symbol: 'SOL' },
};

const EVM_CHAINS: Chain[] = ['bsc', 'eth', 'base'];
const EVM_RPC_URLS: Record<'bsc' | 'eth' | 'base', string> = {
  bsc: 'https://bsc-dataseed.binance.org',
  eth: 'https://cloudflare-eth.com',
  base: 'https://mainnet.base.org',
};

function getDemoSessionId(req: Request): string | undefined {
  const headerId = req.header('x-demo-session-id');
  if (headerId && headerId.trim()) return headerId.trim();

  const queryId = req.query.sid;
  if (typeof queryId === 'string' && queryId.trim()) return queryId.trim();
  return undefined;
}

function isEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

async function fetchEvmNativeBalanceWei(chain: 'bsc' | 'eth' | 'base', address: string): Promise<bigint | null> {
  try {
    const response = await fetch(EVM_RPC_URLS[chain], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getBalance',
        params: [address, 'latest'],
      }),
    });

    if (!response.ok) return null;

    const payload = await response.json() as { result?: string };
    if (!payload.result) return null;
    return BigInt(payload.result);
  } catch {
    return null;
  }
}

async function buildLiveHoldings(params: {
  walletAddress: string;
  selectedChain: Chain;
  nativeBalance?: {
    symbol?: string;
    balanceWei?: string;
    formatted?: string;
  };
}): Promise<UserHolding[]> {
  const { walletAddress, selectedChain, nativeBalance } = params;

  if (isEvmAddress(walletAddress)) {
    const balances = await Promise.all(
      EVM_CHAINS.map(async chain => {
        const wei = await fetchEvmNativeBalanceWei(chain as 'bsc' | 'eth' | 'base', walletAddress);
        if (wei === null) return null;

        const amount = Number(wei) / 1e18;
        if (!Number.isFinite(amount) || amount <= 0) return null;

        const nativePriceUsd = await aveTradeApi.getNativeTokenPriceUsd(chain);
        const token = NATIVE_TOKEN_BY_CHAIN[chain];

        return {
          tokenAddress: token.address,
          tokenSymbol: token.symbol,
          chain,
          balance: wei.toString(),
          balanceUsd: nativePriceUsd ? amount * nativePriceUsd : 0,
          pnlPercent: 0,
        } as UserHolding;
      })
    );

    const nonEmpty = balances.filter((holding): holding is UserHolding => Boolean(holding));
    if (nonEmpty.length > 0) {
      return nonEmpty;
    }
  }

  if (nativeBalance?.balanceWei && nativeBalance?.formatted) {
    const token = NATIVE_TOKEN_BY_CHAIN[selectedChain];
    const nativePriceUsd = await aveTradeApi.getNativeTokenPriceUsd(selectedChain);
    const amount = Number(nativeBalance.formatted);
    if (Number.isFinite(amount) && amount > 0) {
      return [{
        tokenAddress: token.address,
        tokenSymbol: nativeBalance.symbol || token.symbol,
        chain: selectedChain,
        balance: nativeBalance.balanceWei,
        balanceUsd: nativePriceUsd ? amount * nativePriceUsd : 0,
        pnlPercent: 0,
      }];
    }
  }

  return [];
}

router.get('/signals', (req, res) => {
  const userConfig = signalDetector.getUserConfig();
  if (userConfig.runtimeMode === 'demo') {
    res.json({ signals: demoSessionManager.getSignals(getDemoSessionId(req), userConfig) });
    return;
  }

  res.json({ signals: signalDetector.getSignals() });
});

router.post('/signals/:signalId/dismiss', (req, res) => {
  const signalId = req.params.signalId;
  const userConfig = signalDetector.getUserConfig();
  const removed = userConfig.runtimeMode === 'demo'
    ? demoSessionManager.dismissSignal(getDemoSessionId(req), signalId, userConfig)
    : signalDetector.dismissSignal(signalId);

  if (!removed) {
    res.status(404).json({ error: 'Signal not found' });
    return;
  }

  res.json({ success: true });
});

router.get('/holdings', (req, res) => {
  const userConfig = signalDetector.getUserConfig();
  if (userConfig.runtimeMode === 'demo') {
    res.json({ holdings: demoSessionManager.getHoldings(getDemoSessionId(req), userConfig) });
    return;
  }

  res.json({ holdings: signalDetector.getHoldings() });
});

router.get('/wallets', (_req, res) => {
  res.json({ wallets: signalDetector.getTrackedWallets() });
});

router.get('/config', (_req, res) => {
  const userConfig = signalDetector.getUserConfig();
  res.json({
    config: userConfig,
    cesConfig: cesEngine.getConfig(),
    telegram: telegramBot.getStatus(),
    demoHoldings: userConfig.runtimeMode === 'demo' ? true : signalDetector.isUsingDemoHoldings(),
  });
});

router.post('/config', (req, res) => {
  signalDetector.updateUserConfig(req.body);
  const updatedConfig = signalDetector.getUserConfig();
  demoSessionManager.syncAllFromUserConfig(updatedConfig);
  res.json({ success: true, config: updatedConfig, cesConfig: cesEngine.getConfig() });
});

router.post('/connect-wallet', async (req, res) => {
  const { walletAddress, chain, nativeBalance } = req.body as {
    walletAddress?: string;
    chain?: Chain;
    nativeBalance?: {
      symbol?: string;
      balanceWei?: string;
      formatted?: string;
      decimals?: number;
    };
  };

  if (!walletAddress) {
    res.status(400).json({ error: 'walletAddress is required' });
    return;
  }

  const selectedChain: Chain = (
    chain && ['bsc', 'eth', 'base', 'solana'].includes(chain) ? chain : 'bsc'
  ) as Chain;

  signalDetector.updateUserConfig({
    walletAddress,
    chain: selectedChain,
  });

  let delegateCreated = false;
  let assetsId: string | undefined;
  try {
    const wallets = await aveTradeApi.getUserWallets();
    if (aveTradeApi.isSuccessStatus(wallets.status) && Array.isArray(wallets.data)) {
      const delegateWallet = wallets.data.find((w: any) => {
        const matchesChain = Array.isArray(w.addressList)
          ? w.addressList.some((a: any) => a.chain === selectedChain)
          : true;
        return w.type === 'delegate' && matchesChain;
      });

      if (delegateWallet?.assetsId) {
        assetsId = delegateWallet.assetsId;
      }
    }

    if (!assetsId) {
      const createResp = await aveTradeApi.createDelegateWallet(`ExitPulse-${walletAddress.slice(0, 6)}-${Date.now()}`);
      if (aveTradeApi.isSuccessStatus(createResp.status) && createResp.data?.assetsId) {
        assetsId = createResp.data.assetsId;
        delegateCreated = true;
      }
    }

    if (assetsId) {
      signalDetector.updateUserConfig({ assetsId });
    }
  } catch (err: any) {
    console.log('[API] Could not fetch Ave wallets:', err.message);
  }

  let holdingsCount = signalDetector.getHoldings().length;
  const runtimeMode = signalDetector.getUserConfig().runtimeMode;
  if (runtimeMode === 'live') {
    const holdings = await buildLiveHoldings({ walletAddress, selectedChain, nativeBalance });
    signalDetector.setHoldings(holdings);
    holdingsCount = holdings.length;
  } else {
    holdingsCount = demoSessionManager.getHoldings(
      getDemoSessionId(req),
      signalDetector.getUserConfig()
    ).length;
  }

  console.log(`[API] Wallet connected: ${walletAddress} on ${selectedChain} (${runtimeMode} mode)`);
  res.json({
    success: true,
    walletAddress,
    chain: selectedChain,
    assetsId: assetsId || null,
    delegateCreated,
    holdingsCount,
  });
});

router.post('/disconnect-wallet', (_req, res) => {
  const runtimeMode = signalDetector.getUserConfig().runtimeMode;
  signalDetector.updateUserConfig({ walletAddress: '' });
  if (runtimeMode === 'live') {
    signalDetector.setHoldings([]);
  }
  res.json({ success: true });
});

router.get('/telegram/status', (_req, res) => {
  res.json({ telegram: telegramBot.getStatus() });
});

router.post('/telegram/setup', async (req, res) => {
  const botToken = typeof req.body?.botToken === 'string' ? req.body.botToken : '';

  try {
    const result = await telegramBot.configureBotToken(botToken);
    res.json({ success: true, botUsername: result.botUsername, telegram: telegramBot.getStatus() });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Failed to configure Telegram bot token' });
  }
});

router.post('/telegram-link', (_req, res) => {
  const status = telegramBot.getStatus();
  if (!status.configured) {
    res.status(400).json({ error: 'Telegram bot is not configured yet' });
    return;
  }

  const linkCode = telegramBot.generateLinkCode();
  const botUsername = telegramBot.getBotUsername();
  res.json({ linkCode, botUsername });
});

router.post('/telegram/disconnect', (_req, res) => {
  telegramBot.disconnectLinkedChat();
  res.json({ success: true, telegram: telegramBot.getStatus() });
});

router.post('/telegram/reset', (_req, res) => {
  telegramBot.resetBotConfiguration();
  res.json({ success: true, telegram: telegramBot.getStatus() });
});

router.post('/exit', async (req, res) => {
  const { signalId } = req.body;
  const userConfig = signalDetector.getUserConfig();

  if (userConfig.mode === 'manual') {
    res.status(400).json({ error: 'Manual mode uses wallet signing from dashboard. Use "Sign Exit in Wallet".' });
    return;
  }

  const signal = signalDetector.getSignalById(signalId);

  if (!signal) {
    res.status(404).json({ error: 'Signal not found' });
    return;
  }

  const result = await signalDetector.executeSignal(signal, 'delegate');
  res.json(result);
});

router.post('/simulate-exit', async (req, res) => {
  const { signalId, source } = req.body as { signalId?: string; source?: 'dashboard' | 'telegram' | 'auto' };
  const userConfig = signalDetector.getUserConfig();

  if (userConfig.runtimeMode !== 'demo') {
    res.status(400).json({ error: 'Simulation endpoint is only available in demo mode' });
    return;
  }

  if (!signalId) {
    res.status(400).json({ error: 'signalId is required' });
    return;
  }

  const result = await demoSessionManager.simulateExit(
    getDemoSessionId(req),
    signalId,
    source === 'telegram' || source === 'auto' ? source : 'dashboard',
    userConfig
  );

  if (!result.success && result.error === 'Signal not found') {
    res.status(404).json({ error: 'Signal not found' });
    return;
  }

  res.json(result);
});

// ─── Chain Wallet Tx info (frontend builds the tx via PancakeSwap/known DEX) ───

router.post('/build-exit-tx', async (req, res) => {
  const { signalId } = req.body;
  const signal = signalDetector.getSignalById(signalId);

  if (!signal) {
    res.status(404).json({ error: 'Signal not found' });
    return;
  }

  const userConfig = signalDetector.getUserConfig();
  if (!userConfig.walletAddress) {
    res.status(400).json({ error: 'No wallet connected' });
    return;
  }

  if (userConfig.runtimeMode !== 'live') {
    res.status(400).json({ error: 'Live mode is required to build a real wallet transaction' });
    return;
  }

  if (signal.chain === 'solana') {
    res.status(400).json({ error: 'Manual wallet signing is currently supported for EVM chains only' });
    return;
  }

  const inAmount = signal.userHolding?.balance || '0';
  if (!inAmount || inAmount === '0') {
    res.status(400).json({ error: 'No holding amount available for this signal' });
    return;
  }

  try {
    const txResp = await aveTradeApi.createChainWalletTx({
      chain: signal.chain,
      creatorAddress: userConfig.walletAddress,
      inAmount,
      inTokenAddress: signal.tokenAddress,
      outTokenAddress: NATIVE_TOKEN_BY_CHAIN[signal.chain].address,
      swapType: 'sell',
      slippage: '500',
      autoSlippage: true,
    });

    if (!aveTradeApi.isSuccessStatus(txResp.status)) {
      res.status(400).json({ error: txResp.msg || 'Failed to build chain wallet transaction' });
      return;
    }

    const txData = txResp.data;
    const txContent = txData?.txContent;
    let to: string | undefined;
    let data: string | undefined;
    let value = '0';

    if (typeof txContent === 'string') {
      to = txData?.toAddress;
      data = txContent;
      value = txData?.value || '0';
    } else if (txContent && typeof txContent === 'object') {
      to = txContent.to || txContent.toAddress || txData?.toAddress;
      data = txContent.data;
      value = txContent.value || txData?.value || '0';
    }

    if (!to || !data) {
      res.status(500).json({ error: 'Invalid tx payload returned by chain wallet API' });
      return;
    }

    res.json({
      success: true,
      tx: {
        to,
        data,
        value,
      },
      requestTxId: txData?.requestTxId,
      signal: {
        id: signal.id,
        tokenSymbol: signal.tokenSymbol,
        score: signal.score,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to build exit transaction' });
  }
});

router.post('/record-manual-exit', (req, res) => {
  const { signalId, txHash } = req.body as { signalId?: string; txHash?: string };

  if (!signalId || typeof signalId !== 'string') {
    res.status(400).json({ error: 'signalId is required' });
    return;
  }

  if (!txHash || typeof txHash !== 'string') {
    res.status(400).json({ error: 'txHash is required' });
    return;
  }

  const success = signalDetector.markSignalExecuted(signalId, txHash, 'dashboard');
  if (!success) {
    res.status(404).json({ error: 'Signal not found' });
    return;
  }

  res.json({ success: true });
});

router.get('/gas-tips', async (_req, res) => {
  try {
    const data = await aveTradeApi.getGasTips();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/quote', async (req, res) => {
  try {
    const data = await aveTradeApi.getQuote(req.body);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats', (_req, res) => {
  const userConfig = signalDetector.getUserConfig();
  if (userConfig.runtimeMode === 'demo') {
    res.json(demoSessionManager.getStats(getDemoSessionId(_req), userConfig));
    return;
  }

  const signals = signalDetector.getSignals();
  const holdings = signalDetector.getHoldings();
  const wallets = signalDetector.getTrackedWallets();
  const liveStatus = aveDataIngestion.getStatus();

  const now = Date.now();
  const oneHour = 3600000;

  res.json({
    totalSignals: signals.length,
    signalsLastHour: signals.filter(s => now - s.timestamp < oneHour).length,
    criticalSignals: signals.filter(s => s.severity === 'critical' || s.severity === 'high').length,
    trackedWallets: wallets.length,
    holdingsCount: holdings.length,
    totalPortfolioUsd: holdings.reduce((sum, h) => sum + h.balanceUsd, 0),
    runtimeMode: signalDetector.getUserConfig().runtimeMode,
    demoHoldings: signalDetector.isUsingDemoHoldings(),
    liveStreamConnected: liveStatus.connected,
    liveStreamWatchlistCount: liveStatus.watchlistCount,
    liveStreamMessages: liveStatus.messagesReceived,
  });
});

router.get('/live-status', (req, res) => {
  const userConfig = signalDetector.getUserConfig();
  if (userConfig.runtimeMode === 'demo') {
    res.json({
      status: demoSessionManager.getLiveStatus(getDemoSessionId(req), userConfig),
    });
    return;
  }

  res.json({
    status: aveDataIngestion.getStatus(),
  });
});

export default router;

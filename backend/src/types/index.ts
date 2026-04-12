// ─── Smart Wallet Types ───

export interface SmartWallet {
  address: string;
  chain: Chain;
  pnlRank: number;
  totalPnl: number;
  winRate: number;
  label?: string;
}

export interface WalletExit {
  walletAddress: string;
  chain: Chain;
  tokenAddress: string;
  tokenSymbol: string;
  amountSold: string;
  totalPosition: string;
  exitRatio: number; // 0-1
  holdDurationDays: number;
  txHash: string;
  priceUsd: string;
  timestamp: number;
}

// ─── CES (Consensus Exit Score) Types ───

export interface CESSignal {
  id: string;
  tokenAddress: string;
  tokenSymbol: string;
  chain: Chain;
  score: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  exits: WalletExitWithScore[];
  userHolding?: UserHolding;
  timestamp: number;
  action?: 'notify' | 'auto_exit';
  executionStatus?: 'pending' | 'executing' | 'executed' | 'failed';
  executionSource?: 'auto' | 'telegram' | 'dashboard' | 'delegate';
  executionError?: string;
  executionTxHash?: string;
}

export interface WalletExitWithScore extends WalletExit {
  walletWeight: number;
  exitScore: number;
  pnlRank: number;
}

export interface CESConfig {
  windowMinutes: number;
  notifyThreshold: number;
  autoExitThreshold: number;
  criticalThreshold: number;
  minExitRatio: number;
}

// ─── User / Holdings Types ───

export interface UserHolding {
  tokenAddress: string;
  tokenSymbol: string;
  chain: Chain;
  balance: string;
  balanceUsd: number;
  pnlPercent: number;
}

export interface UserConfig {
  walletAddress: string;
  chain: Chain;
  assetsId?: string; // Ave delegate wallet ID
  telegramChatId?: string;
  mode: 'manual' | 'auto';
  runtimeMode: 'demo' | 'live';
  trackedWalletLimit: number;
  cesConfig: CESConfig;
  trackedWallets: string[];
}

// ─── Ave Trade API Types ───

export type Chain = 'solana' | 'bsc' | 'base' | 'eth';

export interface AveSwapOrderRequest {
  chain: Chain;
  assetsId: string;
  inTokenAddress: string;
  outTokenAddress: string;
  inAmount: string;
  swapType: 'buy' | 'sell';
  slippage: string;
  useMev: boolean;
  gas?: string;
  extraGas?: string;
  autoSlippage?: boolean;
  autoGas?: 'low' | 'average' | 'high';
}

export interface AveSwapOrderResponse {
  status: number;
  msg: string;
  data: { id: string };
}

export interface AveOrderStatus {
  id: string;
  status: 'generated' | 'sent' | 'confirmed' | 'error';
  chain: Chain;
  swapType: 'buy' | 'sell';
  txPriceUsd: string;
  txHash: string;
  inAmount: string;
  outAmount: string;
  errorMessage: string;
}

export interface AveUserWallet {
  assetsId: string;
  status: string;
  type: 'self' | 'delegate';
  assetsName: string;
  addressList: { chain: Chain; address: string }[];
}

export interface AveGasTip {
  chain: Chain;
  mev: boolean;
  high: string;
  average: string;
  low: string;
  gasLimit?: string;
}

export interface AveWsMessage {
  topic: string;
  msg: {
    id: string;
    status: 'confirmed' | 'error' | 'auto_cancelled';
    chain: Chain;
    assetsId: string;
    orderType: 'swap' | 'limit';
    swapType: 'buy' | 'sell' | 'stoploss' | 'takeprofit' | 'trailing';
    errorMessage: string;
    txHash: string;
    autoSellTriggerHash: string;
  };
}

// ─── Chain Wallet Transaction Types ───

export interface ChainWalletQuoteRequest {
  chain: Chain;
  inAmount: string;
  inTokenAddress: string;
  outTokenAddress: string;
  swapType: 'buy' | 'sell';
}

export interface ChainWalletQuoteResponse {
  status: number;
  msg: string;
  data: {
    estimateOut: string;
    decimals: number;
    spender: string | string[];
  };
}

export interface ChainWalletTxRequest {
  chain: Chain;
  creatorAddress: string;
  inAmount: string;
  inTokenAddress: string;
  outTokenAddress: string;
  swapType: 'buy' | 'sell';
  slippage: string;
  autoSlippage?: boolean;
  feeRecipient?: string;
  feeRecipientRate?: string;
}

export interface ChainWalletTxResponse {
  status: number;
  msg: string;
  data: {
    chain: Chain;
    creatorAddress: string;
    swapType: string;
    inTokenAddress: string;
    outTokenAddress: string;
    txContent: string | { data?: string; to?: string; toAddress?: string; value?: string }; // EVM calldata or object, Solana base64 string
    toAddress?: string;
    value?: string;
    slippage: string;
    minReturn: string;
    inAmount: string;
    estimateOut: string;
    gasLimit?: string;
    amms: string[];
    createPrice: string;
    requestTxId: string;
  };
}

// ─── Telegram Types ───

export interface TelegramApproval {
  signalId: string;
  chatId: string;
  messageId?: number;
  messageText?: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  createdAt: number;
}

// ─── WebSocket Events (backend → frontend) ───

export interface WsEvent {
  type: 'signal' | 'signal_removed' | 'exit_executed' | 'exit_failed' | 'holdings_update' | 'connection_status' | 'mode_changed';
  data: any;
  timestamp: number;
}

// ─── Native Token Addresses ───

export const NATIVE_TOKENS: Record<Chain, string> = {
  solana: 'sol',
  bsc: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  eth: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  base: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
};

export const USDT_ADDRESSES: Record<Chain, string> = {
  bsc: '0x55d398326f99059ff775485246999027b3197955',
  eth: '0xdac17f958d2ee523a2206206994597c13d831ec7',
  base: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
  solana: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
};

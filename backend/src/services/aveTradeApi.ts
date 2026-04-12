import CryptoJS from 'crypto-js';
import { config } from '../config';
import type {
  Chain,
  AveSwapOrderRequest,
  AveSwapOrderResponse,
  AveOrderStatus,
  AveUserWallet,
  AveGasTip,
  ChainWalletQuoteRequest,
  ChainWalletQuoteResponse,
  ChainWalletTxRequest,
  ChainWalletTxResponse,
} from '../types';
import { NATIVE_TOKENS, USDT_ADDRESSES } from '../types';

class AveTradeApi {
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;

  constructor() {
    this.baseUrl = config.ave.baseUrl;
    this.apiKey = config.ave.apiKey;
    this.apiSecret = config.ave.apiSecret;
  }

  isSuccessStatus(status: number | undefined): boolean {
    return status === 0 || status === 200;
  }

  private normalizePathForSignature(path: string): string {
    const queryIndex = path.indexOf('?');
    return queryIndex >= 0 ? path.slice(0, queryIndex) : path;
  }

  private sortForSignature(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map(item => this.sortForSignature(item));
    }
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      return Object.keys(obj)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = this.sortForSignature(obj[key]);
          return acc;
        }, {});
    }
    return value;
  }

  private buildBodyString(body?: unknown): string | undefined {
    if (body === undefined || body === null) return undefined;
    if (typeof body === 'string') return body.trim();
    return JSON.stringify(this.sortForSignature(body));
  }

  private generateSignature(method: string, path: string, timestamp: string, body?: string): string {
    const signaturePath = this.normalizePathForSignature(path).trim();
    const signString = `${timestamp}${method.toUpperCase().trim()}${signaturePath}${body ?? ''}`;
    const hash = CryptoJS.HmacSHA256(signString, this.apiSecret);
    return CryptoJS.enc.Base64.stringify(hash);
  }

  private async request<T>(method: string, path: string, body?: any): Promise<T> {
    const timestamp = new Date().toISOString();
    const bodyStr = this.buildBodyString(body);
    const signature = this.generateSignature(method, path, timestamp, bodyStr);

    const headers: Record<string, string> = {
      'AVE-ACCESS-KEY': this.apiKey,
      'AVE-ACCESS-SIGN': signature,
      'AVE-ACCESS-TIMESTAMP': timestamp,
      'Content-Type': 'application/json',
    };

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: bodyStr,
    });

    if (!res.ok) {
      const raw = await res.text();
      let detail = raw;
      try {
        const parsed = JSON.parse(raw) as { msg?: string; message?: string; error?: string };
        detail = parsed.msg || parsed.message || parsed.error || raw;
      } catch {
        // Keep raw text if body is not JSON
      }

      const err = new Error(`Ave API error: ${res.status} ${res.statusText} (${method.toUpperCase()} ${path})${detail ? ` - ${detail}` : ''}`) as Error & { status?: number; path?: string };
      err.status = res.status;
      err.path = path;
      throw err;
    }

    return res.json() as Promise<T>;
  }

  private async requestWithFallback<T>(method: string, paths: string[], body?: any): Promise<T> {
    if (!paths.length) {
      throw new Error('No request paths provided');
    }

    let lastError: any;
    for (const path of paths) {
      try {
        return await this.request<T>(method, path, body);
      } catch (err: any) {
        lastError = err;
        // Only fallback on route-not-found; preserve real business/API errors.
        if (err?.status !== 404) {
          throw err;
        }
      }
    }

    throw lastError ?? new Error(`Ave API error: all fallback paths failed for ${method.toUpperCase()}`);
  }

  // ─── Delegate Wallet APIs ───

  async sendSwapOrder(order: AveSwapOrderRequest): Promise<AveSwapOrderResponse> {
    return this.request<AveSwapOrderResponse>('POST', '/v1/thirdParty/tx/sendSwapOrder', order);
  }

  async getSwapOrder(chain: Chain, ids: string[]): Promise<{ status: number; msg: string; data: AveOrderStatus[] }> {
    const idsStr = ids.join(',');
    return this.request('GET', `/v1/thirdParty/tx/getSwapOrder?chain=${chain}&ids=${idsStr}`);
  }

  async getUserWallets(assetsIds?: string[]): Promise<{ status: number; msg: string; data: AveUserWallet[] }> {
    const query = assetsIds ? `?assetsIds=${assetsIds.join(',')}` : '';
    return this.request('GET', `/v1/thirdParty/user/getUserByAssetsId${query}`);
  }

  async createDelegateWallet(assetsName: string): Promise<{ status: number; msg: string; data: AveUserWallet }> {
    return this.request('POST', '/v1/thirdParty/user/generateWallet', { assetsName });
  }

  async getGasTips(): Promise<{ status: number; msg: string; data: AveGasTip[] }> {
    return this.request('GET', '/v1/thirdParty/tx/getGasTip');
  }

  async approveToken(chain: Chain, assetsId: string, tokenAddress: string) {
    return this.request('POST', '/v1/thirdParty/tx/approve', { chain, assetsId, tokenAddress });
  }

  // ─── Chain Wallet APIs ───

  async getQuote(params: ChainWalletQuoteRequest): Promise<ChainWalletQuoteResponse> {
    return this.requestWithFallback<ChainWalletQuoteResponse>('POST', [
      '/v1/thirdParty/chainWallet/getAmountOut',
      '/v1/thirdParty/tx/getAmountOut',
      '/v1/thirdParty/tx/createAmountOut',
    ], params);
  }

  async getNativeTokenPriceUsd(chain: Chain): Promise<number | null> {
    try {
      const quote = await this.getQuote({
        chain,
        inAmount: chain === 'solana' ? '1000000000' : '1000000000000000000',
        inTokenAddress: NATIVE_TOKENS[chain],
        outTokenAddress: USDT_ADDRESSES[chain],
        swapType: 'sell',
      });

      if (!this.isSuccessStatus(quote.status) || !quote.data?.estimateOut) {
        return null;
      }

      const decimals = typeof quote.data.decimals === 'number' ? quote.data.decimals : 6;
      const estimateOut = Number(quote.data.estimateOut);
      if (!Number.isFinite(estimateOut)) {
        return null;
      }

      return estimateOut / Math.pow(10, decimals);
    } catch {
      return null;
    }
  }

  async createChainWalletTx(params: ChainWalletTxRequest): Promise<ChainWalletTxResponse> {
    const paths = params.chain === 'solana'
      ? [
          '/v1/thirdParty/chainWallet/solana/createSolanaTx',
          '/v1/thirdParty/chainWallet/solana/createSwapTx',
        ]
      : [
          '/v1/thirdParty/chainWallet/evm/createEvmTx',
          '/v1/thirdParty/chainWallet/evm/createSwapTx',
        ];
    return this.requestWithFallback<ChainWalletTxResponse>('POST', paths, params);
  }

  // ─── Helper: Execute sell exit via delegate wallet ───

  async executeSellExit(params: {
    chain: Chain;
    assetsId: string;
    tokenAddress: string;
    amount: string;
  }): Promise<AveSwapOrderResponse> {
    const gasData = await this.getGasTips();
    const chainGas = gasData.data.find(g => g.chain === params.chain && !g.mev);

    const order: AveSwapOrderRequest = {
      chain: params.chain,
      assetsId: params.assetsId,
      inTokenAddress: params.tokenAddress,
      outTokenAddress: params.chain === 'solana' ? 'sol' : '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      inAmount: params.amount,
      swapType: 'sell',
      slippage: '500', // 5%
      useMev: false,
      autoSlippage: true,
      autoGas: 'average',
    };

    if (params.chain === 'solana') {
      order.gas = chainGas?.average || '1000000';
    } else {
      order.extraGas = chainGas?.average || '200000000';
    }

    return this.sendSwapOrder(order);
  }
}

export const aveTradeApi = new AveTradeApi();

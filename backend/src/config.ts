import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  ave: {
    apiKey: process.env.AVE_API_KEY || '',
    apiSecret: process.env.AVE_API_SECRET || '',
    baseUrl: process.env.AVE_BASE_URL || 'https://bot-api.ave.ai',
    wssUrl: process.env.AVE_WSS_URL || 'wss://bot-api.ave.ai/thirdws',
    dataWssUrl: process.env.AVE_DATA_WSS_URL || 'wss://wss.ave-api.xyz',
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  },
  server: {
    port: parseInt(process.env.PORT || '3001', 10),
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  },
  defaultChain: (process.env.DEFAULT_CHAIN || 'bsc') as 'solana' | 'bsc' | 'base' | 'eth',
  demoMode: process.env.DEMO_MODE === 'true',
};

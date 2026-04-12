import type { SmartWallet, UserHolding } from '../types';

// ─── Tracked Smart Wallets (top 30 named + up to 100 synthetic) ───

export const TRACKED_SMART_WALLETS: SmartWallet[] = [
  { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', chain: 'bsc', pnlRank: 1,  totalPnl: 2847000, winRate: 0.78, label: 'Vitalik Adjacent'   },
  { address: '0x28C6c06298d514Db089934071355E5743bf21d60', chain: 'bsc', pnlRank: 2,  totalPnl: 1923000, winRate: 0.72, label: 'Degen Alpha'         },
  { address: '0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549', chain: 'bsc', pnlRank: 3,  totalPnl: 1456000, winRate: 0.69, label: 'MEV Specialist'      },
  { address: '0x5041ed759Dd4aFc3a72b8192C143F72f4724081A', chain: 'bsc', pnlRank: 4,  totalPnl: 1120000, winRate: 0.67, label: 'Sniper Alpha'        },
  { address: '0xF977814e90dA44bFA03b6295A0616a897441aceC', chain: 'bsc', pnlRank: 5,  totalPnl:  987000, winRate: 0.65, label: 'OG Trader'           },
  { address: '0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE', chain: 'bsc', pnlRank: 6,  totalPnl:  876000, winRate: 0.64, label: 'DeFi Farmer'         },
  { address: '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8', chain: 'bsc', pnlRank: 7,  totalPnl:  765000, winRate: 0.63, label: 'Quiet Accumulator'   },
  { address: '0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf', chain: 'bsc', pnlRank: 8,  totalPnl:  654000, winRate: 0.61, label: 'Token Hunter'        },
  { address: '0x0716a17FBAeE714f1E6aB0f9d59edbC5f09815C0', chain: 'bsc', pnlRank: 9,  totalPnl:  598000, winRate: 0.60, label: 'Swing King'          },
  { address: '0x4E9ce36E442e55EcD9025B9a6E0D88485d628A67', chain: 'bsc', pnlRank: 10, totalPnl:  543000, winRate: 0.59, label: 'Yield Optimizer'     },
  { address: '0x8894E0a0c962CB723c1ef8B0db6d44B5994aC88a', chain: 'bsc', pnlRank: 11, totalPnl:  498000, winRate: 0.58, label: 'Smart LP'            },
  { address: '0xA910f92ACdAf488FA6eF02174fb86208Ad7722ba', chain: 'bsc', pnlRank: 12, totalPnl:  456000, winRate: 0.57, label: 'Chain Hopper'        },
  { address: '0x161Ba15dB37c14D7CF5F5243E01b0f3F937f3be3', chain: 'bsc', pnlRank: 13, totalPnl:  412000, winRate: 0.56, label: 'Momentum Trader'     },
  { address: '0x7Ef7560EB7b44e3FDa5Ba94e080E1Be8e6702f5f', chain: 'bsc', pnlRank: 14, totalPnl:  389000, winRate: 0.55, label: 'Breakout Bot'        },
  { address: '0xaC6dCFf2e3cfb3b4340345a7F9b29A26A7Da716b', chain: 'bsc', pnlRank: 15, totalPnl:  356000, winRate: 0.54, label: 'Volume Scanner'      },
  { address: '0x73BCEb1Cd57C711feaC4224D062b0F6ff338501e', chain: 'bsc', pnlRank: 16, totalPnl:  334000, winRate: 0.53, label: 'Early Bird'          },
  { address: '0x0fA6b9E67e1F1F4a3f2e1D4b6c1fA1C8c4D2e9a7', chain: 'bsc', pnlRank: 17, totalPnl:  312000, winRate: 0.53, label: 'Whale Watcher'       },
  { address: '0x1Db92e2EeBC8E0c075a02BeA49a2935BcD2dFCF4', chain: 'bsc', pnlRank: 18, totalPnl:  289000, winRate: 0.52, label: 'Pattern Trader'      },
  { address: '0x2fAf487A4414Fe77e2327F0bf4AE2a264a776AD2', chain: 'bsc', pnlRank: 19, totalPnl:  267000, winRate: 0.51, label: 'Risk Manager'        },
  { address: '0x6Cc5F688a315f3dC28A7781717a9A798a59fDA7b', chain: 'bsc', pnlRank: 20, totalPnl:  245000, winRate: 0.51, label: 'Gem Finder'          },
  { address: '0x0D0707963952f2fBA59dD06f2b425ace40b492Fe', chain: 'bsc', pnlRank: 21, totalPnl:  223000, winRate: 0.50, label: 'Alpha Leaker'        },
  { address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', chain: 'bsc', pnlRank: 22, totalPnl:  209000, winRate: 0.49, label: 'Rotation Trader'     },
  { address: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD', chain: 'bsc', pnlRank: 23, totalPnl:  198000, winRate: 0.49, label: 'Narrative Rider'     },
  { address: '0x1111111254EEB25477B68fb85Ed929f73A960582', chain: 'bsc', pnlRank: 24, totalPnl:  187000, winRate: 0.48, label: 'Aggregator Pro'      },
  { address: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF', chain: 'bsc', pnlRank: 25, totalPnl:  176000, winRate: 0.48, label: 'Stealth Buyer'       },
  { address: '0xe592427A0AEce92De3Edee1F18E0157C05861564', chain: 'bsc', pnlRank: 26, totalPnl:  165000, winRate: 0.47, label: 'Multi-Pool'          },
  { address: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F', chain: 'bsc', pnlRank: 27, totalPnl:  154000, winRate: 0.47, label: 'Pair Trader'         },
  { address: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', chain: 'bsc', pnlRank: 28, totalPnl:  143000, winRate: 0.46, label: 'Limit Sniper'        },
  { address: '0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B', chain: 'bsc', pnlRank: 29, totalPnl:  132000, winRate: 0.46, label: 'Gas Optimizer'       },
  { address: '0x3999D2c5207C06BBC5cf8A6bEa52966caBA76Fe5', chain: 'bsc', pnlRank: 30, totalPnl:  121000, winRate: 0.45, label: 'Smart Exit Pro'      },
];

const MAX_TRACKED = 100;

function generateSyntheticAddress(rank: number): string {
  return `0x${rank.toString(16).padStart(40, '0')}`;
}

function buildSyntheticWallet(rank: number): SmartWallet {
  return {
    address: generateSyntheticAddress(rank),
    chain: 'bsc',
    pnlRank: rank,
    totalPnl: Math.max(25000, Math.round(121000 - (rank - 30) * 1800)),
    winRate: Math.max(0.3, 0.45 - (rank - 30) * 0.002),
    label: `Alpha Wallet #${rank}`,
  };
}

export const ALL_TRACKED_SMART_WALLETS: SmartWallet[] = [
  ...TRACKED_SMART_WALLETS,
  ...Array.from(
    { length: MAX_TRACKED - TRACKED_SMART_WALLETS.length },
    (_v, i) => buildSyntheticWallet(TRACKED_SMART_WALLETS.length + i + 1)
  ),
];

// ─── Demo portfolio holdings (~$30k across 12 diverse tokens) ───

export const DEMO_HOLDINGS: UserHolding[] = [
  // ── Blue-chip L1s ──
  { tokenAddress: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', tokenSymbol: 'BTCB', chain: 'bsc', balance: '130000000000000000',        balanceUsd: 8500,  pnlPercent:  18.4 },
  { tokenAddress: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', tokenSymbol: 'ETH',  chain: 'bsc', balance: '2000000000000000000',        balanceUsd: 6200,  pnlPercent:  12.5 },
  { tokenAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', tokenSymbol: 'WBNB', chain: 'bsc', balance: '7000000000000000000',        balanceUsd: 4100,  pnlPercent:   5.7 },
  { tokenAddress: '0x570A5D26f7765Ecb712C0924E4De545B89fD43dF', tokenSymbol: 'SOL',  chain: 'bsc', balance: '22000000000000000000',       balanceUsd: 3200,  pnlPercent:  32.1 },

  // ── DeFi & infrastructure ──
  { tokenAddress: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', tokenSymbol: 'CAKE', chain: 'bsc', balance: '800000000000000000000',      balanceUsd: 2400,  pnlPercent:  45.8 },
  { tokenAddress: '0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD', tokenSymbol: 'LINK', chain: 'bsc', balance: '130000000000000000000',      balanceUsd: 1800,  pnlPercent:   9.3 },
  { tokenAddress: '0xBf5140A22578168FD562DCcF235E5D43A02ce9B1', tokenSymbol: 'UNI',  chain: 'bsc', balance: '180000000000000000000',      balanceUsd: 1200,  pnlPercent: -15.3 },
  { tokenAddress: '0xfb6115445Bff7b52FeB98650C87f44907E58f802', tokenSymbol: 'AAVE', chain: 'bsc', balance: '5000000000000000000',         balanceUsd:  900,  pnlPercent:  22.6 },

  // ── Mid/small-cap diversifiers ──
  { tokenAddress: '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE', tokenSymbol: 'XRP',  chain: 'bsc', balance: '1400000000000000000000',    balanceUsd:  750,  pnlPercent:   8.1 },
  { tokenAddress: '0xbA2aE424d960c26247Dd6c32edC70B295c744C43', tokenSymbol: 'DOGE', chain: 'bsc', balance: '3200000000000000000000',    balanceUsd:  500,  pnlPercent: -22.4 },
  { tokenAddress: '0xa050FFb3eEb8200eEB7F61ce34FF644420FD3522', tokenSymbol: 'ARB',  chain: 'bsc', balance: '400000000000000000000',      balanceUsd:  300,  pnlPercent:  -8.9 },
  { tokenAddress: '0x25d887Ce7a35172C62FeBFD67a1856F20FaEbB00', tokenSymbol: 'PEPE', chain: 'bsc', balance: '15000000000000000000000000', balanceUsd:  150,  pnlPercent: 112.0 },
];

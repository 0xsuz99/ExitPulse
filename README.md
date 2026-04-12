<div align="center">
  <img src="frontend/public/exitpulse.svg" alt="ExitPulse Logo" width="64" height="64" />
  <h1>ExitPulse</h1>
  <p><strong>Real-time smart money exit detection and automated position management</strong></p>
  <p>
    <img src="https://img.shields.io/badge/Built%20on-Ave%20API-00ff88?style=flat-square&logoColor=white" alt="Built on Ave" />
    <img src="https://img.shields.io/badge/Chain-BSC%20%7C%20ETH%20%7C%20Base%20%7C%20Solana-blue?style=flat-square" alt="Chains" />
    <img src="https://img.shields.io/badge/Runtime-Node.js%2018%2B-green?style=flat-square" alt="Node.js" />
  </p>
</div>

---

ExitPulse monitors top-performing crypto wallets, detects when they exit tokens you hold, and calculates a **Consensus Exit Score (CES)** to quantify how serious the exodus is. When the score crosses a threshold, you can exit your position — automatically via a server-side delegate wallet, manually by signing in MetaMask, or through a Telegram approval flow.

### Powered by Ave

ExitPulse is built end-to-end on the Ave platform:

- **Ave Data WebSocket** — streams live on-chain transactions across BSC, Ethereum, Base, and Solana in real time. ExitPulse subscribes to tracked token feeds and filters for sell events from monitored wallets.
- **Ave Trade API (Delegate Wallet)** — Ave generates and manages a custodial wallet per user. In auto mode, ExitPulse submits swap orders directly through the Trade API — no user interaction required. The entire execution happens server-side.
- **Ave Trade API (Chain Wallet)** — In manual mode, Ave builds an unsigned swap transaction with optimal routing. The frontend receives the raw tx and sends it to MetaMask for the user to sign — keeping full custody with the user.
- **Ave Quote API** — Used to fetch real-time price estimates for native tokens and to calculate portfolio USD values from on-chain balances.

This means ExitPulse never needs its own DEX integrations, routing logic, or price oracles — Ave handles all of that.

---

## 📋 Table of Contents

- [How It Works](#-how-it-works)
- [Architecture](#-architecture)
- [CES Algorithm](#-consensus-exit-score-ces-algorithm)
- [Execution Modes](#-execution-modes)
- [Signal Lifecycle](#-signal-lifecycle)
- [Ave API Integration](#-ave-api-integration)
- [Telegram Integration](#-telegram-integration)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Setup & Installation](#-setup--installation)
- [Configuration](#-configuration)
- [API Reference](#-api-reference)
- [WebSocket Events](#-websocket-events)
- [Demo vs Live Mode](#-demo-mode-vs-live-mode)
- [Security & Safety](#-security--safety)

---

## 🔍 How It Works

```
                         ExitPulse Signal Pipeline
 ============================================================================

  [ Ave Data WSS ]          [ Ave Data API ]          [ Demo Engine ]
  Live tx stream             Wallet PnL data           Synthetic exits
        |                         |                         |
        v                         v                         v
  +------------------------------------------------------------------+
  |                    Signal Detector (EventEmitter)                 |
  |                                                                  |
  |  1. Receive wallet exit event                                    |
  |  2. Check: is this wallet in our tracked set?                    |
  |  3. Check: does the user hold this token?                        |
  |  4. Forward to CES Engine for scoring                            |
  +------------------------------------------------------------------+
                                  |
                                  v
  +------------------------------------------------------------------+
  |                    CES Engine (Scoring)                           |
  |                                                                  |
  |    wallet_weight = 1 - (pnl_rank / total_tracked)                |
  |    exit_ratio    = amount_sold / total_position                  |
  |    hold_factor   = log10(days_held + 1) + 1                      |
  |    exit_score    = wallet_weight * exit_ratio * hold_factor       |
  |                                                                  |
  |  CES = SUM(exit_scores) within the rolling window                |
  |                                                                  |
  |  CES >= 1.5  -->  MEDIUM  (notify)                               |
  |  CES >= 3.0  -->  HIGH    (escalation)                           |
  |  CES >= 5.0  -->  CRITICAL (auto-exit candidate)                 |
  +------------------------------------------------------------------+
                                  |
                     CES >= notify threshold?
                        /              \
                      No                Yes
                      |                  |
                   (drop)        +-------+-------+
                                 |               |
                                 v               v
                          [ WebSocket ]    [ Telegram ]
                          Frontend push    Bot notification
                                 |               |
                                 v               v
                          +---------------------------+
                          |     Execution Layer       |
                          |                           |
                          |  Manual:                  |
                          |    Build tx --> MetaMask   |
                          |    sign --> on-chain       |
                          |                           |
                          |  Auto (Delegate Wallet):  |
                          |    Ave Trade API -->       |
                          |    server-side swap        |
                          |                           |
                          |  Telegram Approval:        |
                          |    Inline buttons for      |
                          |    auto-mode non-critical  |
                          +---------------------------+
```

---

## 🏗 Architecture

```
  +-------------------+       WebSocket (ws://:3001/ws)       +------------------+
  |                   | <-----------------------------------> |                  |
  |   React Frontend  |       REST API (http://:3001/api)     |  Node.js Backend |
  |   (Vite :5173)    | <-----------------------------------> |  (Express :3001) |
  |                   |                                       |                  |
  |  +-------------+  |                                       |  +------------+  |
  |  | Wagmi/Viem  |--+-- POST /connect-wallet -------------->|  | Signal     |  |
  |  | MetaMask    |  |                                       |  | Detector   |  |
  |  +-------------+  |                                       |  +-----+------+  |
  |                   |                                       |        |         |
  |  +-------------+  |                                       |  +-----v------+  |
  |  | Signal Feed |<-+-- WS: signal, signal_updated ---------|  | CES Engine |  |
  |  | (real-time) |  |                                       |  +-----+------+  |
  |  +-------------+  |                                       |        |         |
  |                   |                                       |  +-----v------+  |
  |  +-------------+  |                                       |  | Ave Trade  |  |
  |  | Settings    |--+-- POST /config ---------------------->|  | API Client |  |
  |  +-------------+  |                                       |  +-----+------+  |
  |                   |                                       |        |         |
  |  +-------------+  |                                       |  +-----v------+  |
  |  | Telegram    |--+-- POST /telegram/setup -------------->|  | Ave Data   |  |
  |  | Connect     |  |                                       |  | Ingestion  |  |
  |  +-------------+  |                                       |  +-----+------+  |
  +-------------------+                                       |        |         |
                                                              |  +-----v------+  |
                              +-------------------+           |  | Telegram   |  |
                              |   Telegram User   |<----------|  | Bot        |  |
                              |   /start, approve |           |  +------------+  |
                              +-------------------+           |                  |
                                                              |  +------------+  |
                              +-------------------+           |  | Persistence|  |
                              |  Ave Platform     |<----------|  | (JSON)     |  |
                              |  Trade API + WSS  |           |  +------------+  |
                              +-------------------+           +------------------+
```

---

## 🧮 Consensus Exit Score (CES) Algorithm

The CES algorithm quantifies how strongly top-performing wallets are exiting a specific token. It aggregates individual exit scores within a configurable rolling time window.

### Formula

```
For each smart wallet exit in the window:

  wallet_weight  =  1 - (pnl_rank / total_tracked_wallets)
  exit_ratio     =  amount_sold / total_position_size
  hold_factor    =  log10(days_held + 1) + 1

  per_exit_score =  wallet_weight × exit_ratio × hold_factor

CES = SUM of all per_exit_scores for the same token within the window
```

### Variable Breakdown

| Variable | What It Measures | Range | Intuition |
|---|---|---|---|
| `wallet_weight` | How profitable/ranked this wallet is | 0.0 – 1.0 | Rank #1 wallet ≈ 1.0, bottom wallet ≈ 0.0 |
| `exit_ratio` | What fraction of the position was sold | 0.0 – 1.0 | Full dump = 1.0, 10% trim = 0.1 |
| `hold_factor` | How long the wallet held before exiting | 1.0 – 2.8+ | Short hold = 1.0, 60-day hold ≈ 2.78 |

### Severity Thresholds

| CES Score | Severity | Action | What It Means |
|---|---|---|---|
| 🟡 1.5+ | **Medium** | Notify | 2–3 mid-tier wallets exiting. Heads up. |
| 🟠 3.0+ | **High** | Escalated approval | 3+ top wallets exiting aggressively. |
| 🔴 5.0+ | **Critical** | Auto-exit (auto mode) | Mass exodus. Likely exploit, rug, or whale dump. |

### Why It Works

- **Weighted consensus** — A rank #1 wallet dumping 80% after 30 days scores far higher than a rank #45 wallet trimming 15% after 2 days.
- **Rolling window** — Catches coordinated exits that happen over minutes, not just single-block events.
- **Logarithmic hold factor** — Long-term holders exiting carries more weight, but the effect diminishes at extremes.
- **User-specific** — Only triggers if you actually hold the token being exited.

---

## ⚙️ Execution Modes

### 1. 🖊️ Manual Mode (MetaMask Signing)

```
Signal detected
      |
      v
Dashboard shows "Sign Exit in Wallet"
      |
      v
Backend builds swap tx via Ave Chain Wallet API
(token --> native, e.g., CAKE --> BNB)
      |
      v
Frontend sends tx to MetaMask via Wagmi/Viem
      |
      v
User confirms in MetaMask popup
      |
      v
Transaction submitted on-chain → Signal marked WALLET-SIGNED
```

- Private keys never leave the browser.
- Ave builds the optimal swap route; you just sign.
- Telegram stays notification-only in manual mode.

### 2. 🤖 Auto Mode (Delegate Wallet)

```
Signal detected with CES >= critical threshold
      |
      v
signalDetector.handleAutoExit()
      |
      v
aveTradeApi.executeSellExit()
(server-side swap via Ave delegate wallet)
      |
      v
Ave executes on-chain swap
      |
      v
Signal marked AUTO-EXITED → Telegram notified
```

- Ave creates and manages a delegate wallet per user via `createDelegateWallet()`.
- Trades execute server-side — no MetaMask interaction needed.
- The delegate wallet needs funding (gas + the token to sell).
- Limit: 5,000 delegate wallets per API key.

### 3. 📲 Telegram Approval (Auto Mode, Non-Critical)

```
Signal detected (high but not critical)
      |
      v
Telegram bot sends:  [Approve Exit]  [Ignore]
      |
      v
User taps "Approve Exit"
      |
      v
  Demo mode  -->  simulated exit
  Live mode  -->  delegate wallet swap
      |
      v
Bot updates message with result
```

- Works even when the dashboard is closed.
- Rejection dismisses the signal from both Telegram and the dashboard.

---

## 📡 Signal Lifecycle

```
  BIRTH                    ACTIVE                       RESOLUTION
  ─────                    ──────                       ──────────
  Exit detected     →    CES calculated           →    Executed (auto/manual/telegram)
  by CES engine           Signal created                Signal marked EXECUTED
                          Broadcast via WS              Holdings updated
                          Telegram notified             TX hash recorded
                               │                              │
                               │                              or
                               ↓                              ↓
                          Signal updated               Dismissed by user
                          (new exits on same           Signal removed
                           token accumulate)           CES buffer cleared
                          Severity may escalate
```

When multiple exits hit the same token within the rolling window, the existing signal is **updated in-place** rather than creating duplicates — one signal per token, continuously refined.

---

## 🔌 Ave API Integration

ExitPulse uses three Ave platform services:

### Trade API — Delegate Wallet

| Endpoint | Purpose |
|---|---|
| `POST /v1/thirdParty/user/generateWallet` | Create a new delegate wallet |
| `GET /v1/thirdParty/user/getUserByAssetsId` | List user's delegate wallets |
| `POST /v1/thirdParty/tx/sendSwapOrder` | Submit a swap order |
| `GET /v1/thirdParty/tx/getSwapOrder` | Poll order execution status |
| `GET /v1/thirdParty/tx/getGasTip` | Fetch gas price estimates |
| `POST /v1/thirdParty/tx/approve` | Approve token spending |

> **Auth**: HMAC-SHA256 over `timestamp + method + path + body`, sent as Base64 in `AVE-ACCESS-SIGN`.

### Trade API — Chain Wallet

| Endpoint | Purpose |
|---|---|
| `POST /v1/thirdParty/chainWallet/getAmountOut` | Get swap quote |
| `POST /v1/thirdParty/chainWallet/evm/createSwapTx` | Build unsigned EVM tx |
| `POST /v1/thirdParty/chainWallet/solana/createSwapTx` | Build unsigned Solana tx |

### Data WebSocket — Live Ingestion

```
Connect to: wss://wss.ave-api.xyz

Subscribe:
{ "action": "sub", "topic": "multi_tx", "params": { "chain": "bsc", "token": "0x..." } }

Receive:
{ "topic": "multi_tx", "msg": [{ "swap_type": 1, "usd_value": "15000", ... }] }
```

- Auto-reconnect with exponential backoff (max 30s)
- Heartbeat ping every 20 seconds
- 15-minute deduplication cache
- Dynamic subscription management as holdings change

---

## 💬 Telegram Integration

### Setup Flow

1. Create a bot via [@BotFather](https://t.me/BotFather).
2. Paste the bot token into the ExitPulse dashboard.
3. Click **Generate Link Code** — an 8-character code is created (10-minute TTL).
4. Send `/start <LINKCODE>` to your bot in Telegram.
5. The dashboard auto-detects the connection (polls every 3 seconds).

### Bot Commands

| Command | Action |
|---|---|
| `/start [code]` | Link Telegram chat to ExitPulse |
| `/status` | View monitoring status |
| `/holdings` | List your token holdings with USD values |
| `/mode` | Toggle auto / manual exit mode |

### Notification Behavior

| Mode | Severity | Telegram Behavior |
|---|---|---|
| Manual | Any | Notification only (no buttons) |
| Auto | Below critical | Approve / Ignore buttons |
| Auto | Critical | Notification only (auto-executed) |
| Demo + Auto | Below critical | Buttons → simulated execution |

> The Telegram bot runs independently of the frontend. Notifications arrive even when the browser is closed. Bot token and chat ID are persisted across server restarts.

---

## 🛠 Tech Stack

### Backend

| Technology | Purpose |
|---|---|
| **Node.js + TypeScript** | Server runtime |
| **Express** | REST API |
| **ws** | WebSocket server |
| **Grammy** | Telegram Bot framework |
| **crypto-js** | HMAC-SHA256 for Ave API auth |

### Frontend

| Technology | Purpose |
|---|---|
| **React 18 + TypeScript** | UI framework |
| **Vite** | Build tool and dev server |
| **Wagmi + Viem** | Wallet connection (MetaMask) |
| **TanStack React Query** | Server state + auto-polling |
| **Framer Motion** | Animations |
| **Tailwind CSS** | Styling |

### External Services

| Service | Purpose |
|---|---|
| **Ave Trade API** | Delegate wallet, swap execution, tx building |
| **Ave Data WSS** | Real-time blockchain tx streaming |
| **Telegram Bot API** | Notifications and approval workflow |
| **EVM RPC** (BSC/ETH/Base) | Native balance queries |

---

## 📁 Project Structure

```
exitpulse/
├── backend/
│   ├── data/
│   │   └── runtime-config.json     # Persisted Telegram config
│   └── src/
│       ├── config.ts               # Environment config loader
│       ├── index.ts                # Express + WebSocket server
│       ├── types/index.ts          # All TypeScript types
│       ├── routes/api.ts           # REST API endpoints
│       └── services/
│           ├── signalDetector.ts   # Core signal detection engine
│           ├── cesEngine.ts        # CES scoring algorithm
│           ├── aveTradeApi.ts      # Ave API client
│           ├── aveDataIngestion.ts # Live blockchain tx stream
│           ├── telegramBot.ts      # Telegram bot (Grammy)
│           └── persistence.ts      # JSON config persistence
│
└── frontend/
    └── src/
        ├── App.tsx                 # Main app + tab routing
        ├── config/
        │   ├── api.ts              # Centralized API/WS URLs
        │   └── wagmi.ts            # Wagmi chain + connector config
        ├── components/
        │   ├── SignalFeed.tsx       # Real-time signal list
        │   ├── Dashboard.tsx       # Stats cards
        │   ├── Settings.tsx        # CES thresholds + modes
        │   ├── Holdings.tsx        # Token holdings display
        │   ├── TelegramConnect.tsx # Telegram setup UI
        │   └── ConnectWallet.tsx   # MetaMask connection
        └── hooks/
            ├── useApi.ts           # React Query hooks
            └── useWebSocket.ts     # WebSocket + event handling
```

---

## 🚀 Setup & Installation

### Prerequisites

- **Node.js** >= 18
- **Ave API credentials** — key + secret from [ave.ai](https://ave.ai)
- **MetaMask** (or any injected EVM wallet) for manual execution
- **Telegram Bot Token** — optional, create via [@BotFather](https://t.me/BotFather)

### 1. Clone & Install

```bash
git clone <repo-url>
cd exitpulse

cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure Environment

Create `backend/.env`:

```env
AVE_API_KEY=your_api_key_here
AVE_API_SECRET=your_api_secret_here
AVE_BASE_URL=https://bot-api.ave.ai

TELEGRAM_BOT_TOKEN=    # optional — can be set from the UI
PORT=3001
FRONTEND_URL=http://localhost:5173
DEFAULT_CHAIN=bsc
DEMO_MODE=true
```

### 3. Run Locally

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Frontend → `http://localhost:5173` · Backend → `http://localhost:3001`

### 4. Quick Start

1. Open the dashboard — it loads in **demo mode** with signals appearing within ~1.5 seconds.
2. Click **Connect Wallet** in the navbar to connect MetaMask.
3. Open **Settings** to switch between manual/auto mode or demo/live.
4. Set up **Telegram** from the sidebar — paste your bot token, generate a link code, send `/start` to the bot.
5. Watch signals auto-execute in auto mode, or click **Simulate Exit** in demo mode.

---

## ⚙️ Configuration

### Runtime Mode

| Mode | Signals | Holdings | Execution |
|---|---|---|---|
| **Demo** | Synthetic bursts every 9–15s | Pre-seeded (ETH, BTCB, CAKE, UNI, XRP) | Simulated |
| **Live** | Real Ave Data WSS stream | From connected wallet | Real on-chain |

### Exit Mode

| Mode | Behavior |
|---|---|
| **Manual** | Dashboard signing via MetaMask. Telegram is notification-only. |
| **Auto** | Critical signals auto-execute. Non-critical signals → Telegram approval. |

### CES Thresholds

| Setting | Default | Range |
|---|---|---|
| Early Warning | 1.5 | 0.5 – 5.0 |
| High-Risk Trigger | 3.0 | 1.0 – 10.0 |
| Critical Panic | 5.0 | 2.0 – 15.0 |
| Consensus Window | 15 min | 5 – 60 min |
| Tracked Wallets | 50 | 10 – 100 |

---

## 📖 API Reference

All endpoints prefixed with `/api`.

### Signals
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/signals` | List active signals |
| `POST` | `/signals/:id/dismiss` | Dismiss a signal |

### Holdings & Wallets
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/holdings` | Get token holdings |
| `GET` | `/wallets` | List tracked wallets |
| `POST` | `/connect-wallet` | Connect wallet + create delegate wallet |
| `POST` | `/disconnect-wallet` | Disconnect wallet |

### Execution
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/exit` | Execute via delegate wallet |
| `POST` | `/simulate-exit` | Simulate exit (demo mode) |
| `POST` | `/build-exit-tx` | Build unsigned tx for MetaMask |
| `POST` | `/record-manual-exit` | Record a signed tx hash |

### Telegram
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/telegram/setup` | Configure bot token |
| `POST` | `/telegram-link` | Generate link code |
| `POST` | `/telegram/disconnect` | Unlink chat |

### Utility
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/stats` | Signal counts, portfolio value |
| `GET` | `/live-status` | Live ingestion engine status |
| `GET` | `/health` | Server health check |

---

## 🔁 WebSocket Events

| Event | Direction | Description |
|---|---|---|
| `connection_status` | Server → Client | Sent on initial connect |
| `signal` | Server → Client | New or updated signal |
| `signal_removed` | Server → Client | Signal dismissed |
| `exit_executed` | Server → Client | Exit completed |
| `exit_failed` | Server → Client | Exit failed |
| `holdings_update` | Server → Client | Holdings changed |
| `mode_changed` | Server → Client | Runtime mode switched (clears feed) |

---

## 🔄 Demo Mode vs Live Mode

### Demo Mode

Great for walkthroughs and showcasing the product without real funds.

- Signals appear every 9–15 seconds, with the first one firing within ~1.5 seconds of startup.
- Holdings are pre-seeded with 5 BSC tokens.
- Execution is fully simulated — a realistic tx hash is generated, nothing goes on-chain.
- If MetaMask is connected, you're prompted to sign a human-readable approval message to demonstrate the wallet interaction UX.

### Live Mode

Real monitoring, real execution.

- Signals come from the Ave Data WebSocket stream — only fires if a tracked wallet actually exits a token you hold.
- Holdings are derived from your connected wallet's on-chain balances.
- Manual execution: Ave builds the unsigned tx, MetaMask signs, tx is broadcast.
- Auto execution: Ave's delegate wallet handles the swap server-side.

---

## 🔒 Security & Safety

- **Private keys never leave the browser** — manual mode signs locally via Wagmi/Viem.
- **Delegate wallet is Ave-custodied** — auto mode trades with Ave's infrastructure (convenience vs. custody trade-off).
- **HMAC-SHA256 auth** on all Ave API requests — signed with timestamp to prevent replays.
- **Telegram link codes expire** in 10 minutes. Generating a new code invalidates all previous ones.
- **No database** — all signal state is in-memory. Only Telegram config is persisted to disk.
- **45-second cooldown** per token in auto mode prevents repeated execution on the same signal.

---

## 📄 License

Built for the Ave Hackathon.

# ExitPulse

**Real-time smart money exit detection and automated position management**

ExitPulse monitors top-performing crypto wallets across multiple chains, detects when they exit tokens you hold, calculates a **Consensus Exit Score (CES)** to quantify the severity of the exodus, and enables you to exit your own positions -- automatically via a delegate wallet or manually by signing in MetaMask/dashboard flow, with Telegram approvals available for non-critical auto-mode signals.

Built on the [Ave](https://ave.ai) ecosystem (Data API, Trade API, WebSocket streams).

---

## Table of Contents

- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Consensus Exit Score (CES) Algorithm](#consensus-exit-score-ces-algorithm)
- [Execution Modes](#execution-modes)
- [Signal Lifecycle](#signal-lifecycle)
- [Ave API Integration](#ave-api-integration)
- [Telegram Integration](#telegram-integration)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup & Installation](#setup--installation)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [WebSocket Events](#websocket-events)
- [Demo Mode vs Live Mode](#demo-mode-vs-live-mode)
- [Security & Safety](#security--safety)

---

## How It Works

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
  |  For each exit in the rolling time window:                       |
  |                                                                  |
  |    wallet_weight = 1 - (pnl_rank / total_tracked)                |
  |    exit_ratio    = amount_sold / total_position                  |
  |    hold_factor   = log10(days_held + 1) + 1                      |
  |    exit_score    = wallet_weight * exit_ratio * hold_factor       |
  |                                                                  |
  |  CES = SUM(exit_scores) within the rolling window                |
  |                                                                  |
  |  Severity thresholds:                                            |
  |    CES >= 1.5  -->  MEDIUM  (notify)                             |
  |    CES >= 3.0  -->  HIGH    (high-risk escalation)               |
  |    CES >= 5.0  -->  CRITICAL (auto-exit candidate)               |
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

## Architecture

```
                        ExitPulse Architecture
 ============================================================================

  +-------------------+       WebSocket (ws://:3001/ws)       +------------------+
  |                   | <-----------------------------------> |                  |
  |   React Frontend  |       REST API (http://:3001/api)     |  Node.js Backend |
  |   (Vite :5173)    | <-----------------------------------> |  (Express :3001) |
  |                   |                                       |                  |
  |  +-------------+  |                                       |  +------------+  |
  |  | Wagmi/Viem  |  |                                       |  | Signal     |  |
  |  | MetaMask    |--+-- POST /connect-wallet -------------->|  | Detector   |  |
  |  +-------------+  |                                       |  +-----+------+  |
  |                   |                                       |        |         |
  |  +-------------+  |                                       |  +-----v------+  |
  |  | Signal Feed |  |<-- WS: signal, signal_updated --------|  | CES Engine |  |
  |  | (real-time) |  |                                       |  +-----+------+  |
  |  +-------------+  |                                       |        |         |
  |                   |                                       |  +-----v------+  |
  |  +-------------+  |                                       |  | Ave Trade  |  |
  |  | Settings    |--+-- POST /config ---------------------->|  | API Client |  |
  |  | (CES/mode)  |  |                                       |  +-----+------+  |
  |  +-------------+  |                                       |        |         |
  |                   |                                       |  +-----v------+  |
  |  +-------------+  |                                       |  | Ave Data   |  |
  |  | Telegram    |--+-- POST /telegram/setup -------------->|  | Ingestion  |  |
  |  | Connect     |  |                                       |  | (WSS)      |  |
  |  +-------------+  |                                       |  +-----+------+  |
  +-------------------+                                       |        |         |
                                                              |  +-----v------+  |
                                                              |  | Telegram   |  |
                                                              |  | Bot        |  |
                              +-------------------+           |  | (Grammy)   |  |
                              |   Telegram User   |<----------|  +------------+  |
                              |   /start, approve |           |                  |
                              |   /reject, /mode  |           |  +------------+  |
                              +-------------------+           |  | Persistence|  |
                                                              |  | (JSON)     |  |
                              +-------------------+           |  +------------+  |
                              |  Ave Platform     |           |                  |
                              |  - Trade API      |<----------|                  |
                              |  - Data WSS       |           |                  |
                              |  - Delegate Wallet|           +------------------+
                              +-------------------+
```

---

## Consensus Exit Score (CES) Algorithm

The CES algorithm quantifies how strongly top-performing wallets are exiting a specific token. It aggregates individual exit scores within a configurable rolling time window.

### Formula

```
For each smart wallet exit in the window:

  wallet_weight = 1 - (pnl_rank / total_tracked_wallets)
  exit_ratio    = amount_sold / total_position_size
  hold_factor   = log10(days_held + 1) + 1

  per_exit_score = wallet_weight x exit_ratio x hold_factor


CES = SUM of all per_exit_scores for the same token within the time window
```

### Variable Breakdown

| Variable | What It Measures | Range | Intuition |
|---|---|---|---|
| `wallet_weight` | How profitable/ranked this wallet is | 0.0 - 1.0 | Rank #1 wallet = weight ~1.0, bottom wallet = ~0.0 |
| `exit_ratio` | What fraction of the position was sold | 0.0 - 1.0 | 100% dump = 1.0, 10% trim = 0.1 |
| `hold_factor` | How long the wallet held before exiting | 1.0 - 2.8+ | Short hold = 1.0, 60-day hold = 2.78 (log scale) |

### Severity Thresholds (Configurable)

| CES Score | Severity | Default Action | What It Means |
|---|---|---|---|
| 1.5+ | **Medium** | Notify | 2-3 mid-tier wallets exiting. Heads up. |
| 3.0+ | **High** | Escalated approval flow | 3+ top wallets exiting aggressively. Strong signal. |
| 5.0+ | **Critical** | Auto-exit in auto mode | Mass exodus by top-ranked wallets. Likely exploit, rug, or whale dump. |

### Why This Works

- **Weighted consensus**: A rank #1 wallet dumping 80% after holding 30 days scores far higher than a rank #45 wallet trimming 15% after 2 days.
- **Rolling window**: Catches coordinated exits that happen over minutes, not just single-block events.
- **Logarithmic hold factor**: Long-term holders exiting is more significant than day-traders rotating -- but the effect diminishes (selling after 60 days vs 90 days is roughly equal).
- **User-specific**: Only triggers if the user actually holds the token being exited.

---

## Execution Modes

ExitPulse supports three distinct execution paths:

### 1. Manual Mode (Chain Wallet / MetaMask Signing)

```
Signal detected
      |
      v
Dashboard shows "Sign Exit in Wallet" button
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
Transaction submitted on-chain
      |
      v
Signal marked as WALLET-SIGNED
```

- User retains full custody (private keys never leave the browser).
- Ave builds the optimal swap route; the user just signs.
- Telegram sends approval request in parallel (informational in manual mode).

### 2. Auto Mode (Delegate Wallet)

```
Signal detected with CES >= critical threshold
      |
      v
signalDetector.handleAutoExit()  (critical only)
      |
      v
aveTradeApi.executeSellExit()
(server-side swap via Ave delegate wallet)
      |
      v
Ave executes on-chain swap
      |
      v
Signal marked as AUTO-EXITED
Telegram notified of execution
```

- Ave creates and manages a delegate wallet per user via `createDelegateWallet()`.
- Trades execute server-side -- no MetaMask interaction needed.
- The delegate wallet needs funding (native token for gas + tokens to sell).
- User's API key limit: 5,000 delegate wallets.

### 3. Telegram Approval (Auto Mode Non-Critical Signals)

```
Signal detected
      |
      v
Telegram bot sends message with:
  [Approve Exit]  [Ignore]
      |
      v
User taps "Approve Exit"
      |
      v
Bot triggers execution:
  - Demo + auto + non-critical: simulated exit
  - Live + auto + non-critical: delegate wallet swap
  - Manual mode: no Telegram approval, dashboard-only signature flow
      |
      v
Bot updates message with result
```

- Works independently of whether the dashboard is open.
- Approval buttons are available only for auto-mode non-critical signals.
- Rejecting a signal dismisses it from both Telegram and the dashboard feed.

---

## Signal Lifecycle

```
  BIRTH                    ACTIVE                    RESOLUTION
  =====                    ======                    ==========

  Exit detected     -->    CES calculated      -->    Executed (auto/manual/telegram)
  by CES engine            Signal created             Signal marked EXECUTED
                           Broadcast via WS           Holdings updated
                           Telegram notified          TX hash recorded
                           |                          |
                           |                          or
                           |                          |
                           v                          v
                        Signal updated             Dismissed
                        (new exits add             Signal removed
                         to same token)            CES buffer cleared
                        CES recalculated
                        Severity may escalate
```

### Signal Deduplication

When multiple exits hit the same token within the rolling window:
- The existing signal is **updated in-place** (score, severity, exits list).
- The frontend receives a `signal_updated` WebSocket event.
- If the updated CES crosses the auto-exit threshold, auto-execution triggers.
- This prevents signal spam -- one signal per token, continuously refined.

---

## Ave API Integration

ExitPulse uses three Ave platform services:

### 1. Trade API (Delegate Wallet)

Used for server-side automated exits.

| Endpoint | Purpose |
|---|---|
| `POST /v1/thirdParty/user/generateWallet` | Create a new delegate wallet |
| `GET /v1/thirdParty/user/getUserByAssetsId` | List user's delegate wallets |
| `POST /v1/thirdParty/tx/sendSwapOrder` | Submit a swap order |
| `GET /v1/thirdParty/tx/getSwapOrder` | Poll order execution status |
| `GET /v1/thirdParty/tx/getGasTip` | Fetch gas price estimates |
| `POST /v1/thirdParty/tx/approve` | Approve token spending |

**Authentication**: HMAC-SHA256 signature over `timestamp + method + path + body`, sent as Base64 in the `AVE-ACCESS-SIGN` header.

### 2. Trade API (Chain Wallet)

Used for building unsigned transactions the user signs in MetaMask.

| Endpoint | Purpose |
|---|---|
| `POST /v1/thirdParty/chainWallet/getAmountOut` | Get swap quote (price estimate) |
| `POST /v1/thirdParty/chainWallet/evm/createSwapTx` | Build unsigned EVM swap tx |
| `POST /v1/thirdParty/chainWallet/solana/createSwapTx` | Build unsigned Solana swap tx |

### 3. Data WebSocket (Live Ingestion)

Used for real-time transaction monitoring across chains.

```
Connect to: wss://wss.ave-api.xyz

Subscribe:
{
  "action": "sub",
  "topic": "multi_tx",
  "params": { "chain": "bsc", "token": "0x...", "pageToken": "latest" }
}

Receive:
{
  "topic": "multi_tx",
  "msg": [{
    "chain": "bsc",
    "from_address": "0x...",
    "to_address": "0x...",
    "swap_type": 1,  // 1 = sell
    "usd_value": "15000",
    "token_address": "0x...",
    ...
  }]
}
```

- Auto-reconnect with exponential backoff (max 30s).
- Heartbeat ping every 20 seconds.
- Transaction deduplication (15-minute TTL cache).
- Dynamic subscription management as user holdings change.

---

## Telegram Integration

### Setup Flow

1. Create a bot via [@BotFather](https://t.me/BotFather) on Telegram.
2. Paste the bot token into the ExitPulse dashboard.
3. Click "Generate Link Code" -- an 8-character code is created (10-minute TTL).
4. Open your bot in Telegram and send `/start <LINKCODE>`.
5. The dashboard auto-detects the connection (polls every 3 seconds).

### Bot Commands

| Command | Action |
|---|---|
| `/start [code]` | Link Telegram chat to ExitPulse |
| `/status` | View monitoring status (mode, chain, wallet count, recent signals) |
| `/holdings` | List your tracked token holdings with USD values |
| `/mode` | Toggle between auto and manual exit mode |

### Notification Behavior

| Mode | Signal Action | Telegram Behavior |
|---|---|---|
| Manual + any severity | Notify | Sends notification only (no approve/reject buttons) |
| Auto + below critical | Notify | Sends message with Approve/Ignore buttons |
| Auto + critical | Auto-exit | Sends notification (no buttons, auto-executed) |
| Demo + auto + below critical | Simulate | Sends message with buttons, approve triggers simulated execution |

### Persistence

The bot token and linked chat ID are persisted to `backend/data/runtime-config.json`. The bot resumes automatically on server restart -- no need to re-enter the token or re-link.

The Telegram bot runs independently of the frontend. Notifications arrive even when the browser is closed.

---

## Tech Stack

### Backend

| Technology | Purpose |
|---|---|
| **Node.js + TypeScript** | Server runtime |
| **Express** | REST API framework |
| **ws** | WebSocket server for real-time frontend push |
| **Grammy** | Telegram Bot API framework |
| **crypto-js** | HMAC-SHA256 signing for Ave API auth |
| **tsx** | TypeScript execution (dev mode) |

### Frontend

| Technology | Purpose |
|---|---|
| **React 18** | UI framework |
| **TypeScript** | Type safety |
| **Vite** | Build tool and dev server |
| **Wagmi + Viem** | Wallet connection (MetaMask/injected) |
| **TanStack React Query** | Server state management with auto-polling |
| **Framer Motion** | Animations |
| **Tailwind CSS** | Utility-first styling |
| **Lucide React** | Icon library |

### External Services

| Service | Purpose |
|---|---|
| **Ave Trade API** | Delegate wallet management, swap execution, chain wallet tx building |
| **Ave Data WSS** | Real-time blockchain transaction streaming |
| **Telegram Bot API** | User notifications and approval workflow |
| **EVM RPC** (BSC/ETH/Base) | Native balance queries |

---

## Project Structure

```
exitpulse/
  backend/
    data/
      runtime-config.json        # Persisted telegram config
    src/
      config.ts                  # Environment config loader
      index.ts                   # Express + WS server entry point
      types/
        index.ts                 # All TypeScript type definitions
      services/
        signalDetector.ts        # Core signal detection & execution engine
        cesEngine.ts             # CES scoring algorithm
        aveTradeApi.ts           # Ave API client (HMAC-SHA256 auth)
        aveDataIngestion.ts      # Live blockchain tx stream consumer
        telegramBot.ts           # Grammy Telegram bot service
        persistence.ts           # JSON file-based config persistence
      routes/
        api.ts                   # REST API endpoints
    package.json
    tsconfig.json
    .env                         # API keys and config (not committed)

  frontend/
    src/
      main.tsx                   # React entry with Wagmi/QueryClient providers
      App.tsx                    # Main app with tab routing + signal merge logic
      config/
        wagmi.ts                 # Wagmi chain + connector config
      components/
        Navbar.tsx               # Top bar with mode toggle + wallet display
        Hero.tsx                 # Latest signal banner
        Dashboard.tsx            # Stats cards grid
        SignalFeed.tsx           # Real-time signal list with execution buttons
        Holdings.tsx             # User token holdings display
        TrackedWallets.tsx       # Monitored wallet list
        TelegramConnect.tsx      # Telegram bot setup + linking UI
        ConnectWallet.tsx        # MetaMask wallet connection
        LiveEngineStatus.tsx     # Live ingestion health dashboard
        Settings.tsx             # CES thresholds, modes, chain selection
        HowItWorks.tsx           # Educational signal flow diagram
        RuntimeModeSwitch.tsx    # Demo/Live toggle component
      hooks/
        useApi.ts                # React Query hooks for all API endpoints
        useWebSocket.ts          # WebSocket connection + event handler
      index.css                  # Tailwind base + custom utilities
    tailwind.config.js           # Custom theme (pulse-* colors, animations)
    package.json
    vite.config.ts
    tsconfig.json
```

---

## Setup & Installation

### Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- **Ave API credentials** (API key + secret from [ave.ai](https://ave.ai))
- **MetaMask** or any injected EVM wallet (for manual execution)
- **Telegram Bot Token** (optional, for Telegram integration -- create via [@BotFather](https://t.me/BotFather))

### 1. Clone & Install

```bash
git clone <repo-url>
cd exitpulse

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment

Create `backend/.env`:

```env
# Ave API (required)
AVE_API_KEY=your_api_key_here
AVE_API_SECRET=your_api_secret_here
AVE_BASE_URL=https://bot-api.ave.ai

# Telegram Bot (optional -- can also be configured from the UI)
TELEGRAM_BOT_TOKEN=

# Server
PORT=3001
FRONTEND_URL=http://localhost:5173

# Defaults
DEFAULT_CHAIN=bsc
DEMO_MODE=true
```

### 3. Start Development Servers

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev
```

The backend runs on `http://localhost:3001` and the frontend on `http://localhost:5173`.

### 4. Quick Start Walkthrough

1. Open `http://localhost:5173` -- the dashboard loads in **demo mode** with simulated signals.
2. Click **Connect Wallet** in the navbar to connect MetaMask.
3. Set up Telegram in the sidebar (paste bot token, generate link code, send `/start` to your bot).
4. Watch signals appear in the feed every 9-15 seconds.
5. Try clicking **Simulate Exit** on a signal to see the execution flow.
6. Switch to **Auto mode** in settings to see critical signals auto-execute and non-critical signals use Telegram approvals.
7. Switch to **Live mode** to use your real wallet holdings and live blockchain monitoring.

---

## Configuration

### Runtime Mode

| Mode | Signal Source | Holdings | Execution |
|---|---|---|---|
| **Demo** | Synthetic bursts (9-15s interval) | Pre-seeded (ETH, BTCB, CAKE, UNI, XRP) | Simulated (fake tx hash) |
| **Live** | Ave Data WSS (real blockchain txs) | From connected wallet (native balance + token positions) | Real on-chain swaps |

### Exit Mode

| Mode | Behavior |
|---|---|
| **Manual** | Every exit requires dashboard signing flow (MetaMask in live, Simulate + Sign in demo). Telegram is notification-only. |
| **Auto** | Critical signals auto-execute via delegate wallet/simulation. Non-critical signals can be approved via Telegram. |

### CES Thresholds

All thresholds are configurable from the Settings page:

| Setting | Default | Range | Description |
|---|---|---|---|
| Early Warning | 1.5 | 0.5 - 5.0 | Minimum CES to generate a signal |
| High-Risk Trigger | 3.0 | 1.0 - 10.0 | CES level for escalation and approval requests |
| Critical Panic | 5.0 | 2.0 - 15.0 | CES level for immediate auto-execution |
| Consensus Window | 15 min | 5 - 60 min | Time window for aggregating exits into a single score |
| Tracked Wallet Limit | 50 | 10 - 100 | Number of top wallets to monitor |

---

## API Reference

All endpoints are prefixed with `/api`.

### Signals

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/signals` | List all active signals |
| `POST` | `/signals/:signalId/dismiss` | Dismiss a signal from the feed |

### Holdings & Wallets

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/holdings` | Get user's token holdings |
| `GET` | `/wallets` | List tracked smart wallets |
| `POST` | `/connect-wallet` | Connect EVM wallet (creates delegate wallet if needed) |
| `POST` | `/disconnect-wallet` | Disconnect wallet and clear live holdings |

### Execution

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/exit` | Execute exit via delegate wallet (live + auto mode) |
| `POST` | `/simulate-exit` | Simulate exit in demo mode |
| `POST` | `/build-exit-tx` | Build unsigned swap tx for MetaMask signing (live mode) |
| `POST` | `/record-manual-exit` | Record a manually signed tx hash against a signal |

### Configuration

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/config` | Get user config, CES config, and Telegram status |
| `POST` | `/config` | Update user config (mode, thresholds, chain, etc.) |

### Telegram

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/telegram/status` | Get bot status (configured, linked, username) |
| `POST` | `/telegram/setup` | Configure bot token |
| `POST` | `/telegram-link` | Generate link code for Telegram chat linking |
| `POST` | `/telegram/disconnect` | Disconnect linked Telegram chat |
| `POST` | `/telegram/reset` | Reset entire bot configuration |

### Utility

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/stats` | Aggregated stats (signal counts, portfolio value, live status) |
| `GET` | `/live-status` | Live ingestion engine status (connections, subscriptions, message counts) |
| `GET` | `/gas-tips` | Current gas price estimates from Ave |
| `POST` | `/quote` | Get swap quote from Ave |
| `GET` | `/health` | Server health check |

---

## WebSocket Events

The backend pushes events to the frontend via WebSocket at `ws://localhost:3001/ws`.

| Event Type | Direction | Payload | Description |
|---|---|---|---|
| `connection_status` | Server --> Client | `{ connected: true, demo: boolean }` | Sent on initial connection |
| `signal` | Server --> Client | `CESSignal` object | New signal detected or existing signal updated |
| `signal_removed` | Server --> Client | `{ signalId: string }` | Signal was dismissed |
| `exit_executed` | Server --> Client | `{ signalId, txHash, status, source }` | Exit was executed successfully |
| `exit_failed` | Server --> Client | `{ signalId, error }` | Exit execution failed |
| `holdings_update` | Server --> Client | `{ holdings, type }` | User holdings changed |
| `mode_changed` | Server --> Client | `{ runtimeMode }` | Runtime mode switched (clears signal feed) |

### Frontend Signal Handling

- **New signal**: Prepended to the feed, deduplication by ID.
- **Signal update**: Existing signal replaced in-place (same ID, new score/severity).
- **Mode change**: Local signal buffer is cleared; React Query caches are invalidated.
- **Exit executed**: Related query caches are invalidated to refresh holdings and stats.

---

## Demo Mode vs Live Mode

### Demo Mode

Designed for showcasing the product without real funds.

- **Signals**: Generated every 9-15 seconds by the demo engine. 1-4 tracked wallets "exit" a random user holding per cycle.
- **Holdings**: Pre-seeded with 5 BSC tokens (ETH, BTCB, CAKE, UNI, XRP).
- **Execution**: Simulated -- a fake tx hash is generated after a 1.6-second delay. No on-chain activity.
- **Wallet signing**: If MetaMask is connected, the user is prompted to sign a human-readable approval message (not a transaction). This demonstrates the wallet interaction UX.
- **Auto mode**: Critical signals auto-execute in simulation. Non-critical signals can be approved from Telegram.
- **Telegram**: In manual mode, Telegram is notification-only. In auto mode (non-critical), approval buttons trigger simulated execution.

### Live Mode

Real blockchain monitoring and execution.

- **Signals**: Generated from live Ave Data WSS stream. Only fires when a tracked wallet actually sells a token the user holds.
- **Holdings**: Derived from the connected wallet's on-chain balances (native token balance queried via EVM RPC, priced via Ave quote API).
- **Execution (Manual)**: Ave builds an unsigned swap tx; MetaMask prompts for signature; the tx is broadcast on-chain.
- **Execution (Auto)**: Ave's delegate wallet executes the swap server-side. Requires the delegate wallet to be funded with gas + the token to sell.
- **Delegate Wallet**: Created automatically when the user connects their wallet. Ave manages the keys. Limited to 5,000 wallets per API key.

### Switching Modes

Switching between demo and live clears the signal feed (both backend state and frontend buffer) and broadcasts a `mode_changed` WebSocket event. All settings (CES thresholds, exit mode, chain) persist across mode changes.

---

## Security & Safety

- **Private keys never leave the browser.** Manual mode uses Wagmi/Viem to sign transactions locally in MetaMask. The backend only builds the unsigned transaction data.
- **Delegate wallet is custodied by Ave.** Auto mode uses Ave's infrastructure to hold keys and execute trades. This is a trade-off: convenience vs custody.
- **HMAC-SHA256 API authentication.** All Ave API requests are signed with a timestamp + secret. Replay attacks are mitigated by timestamp validation.
- **Telegram link codes expire.** Each code is valid for 10 minutes. Generating a new code invalidates all previous codes.
- **Bot token is persisted locally.** Stored in `backend/data/runtime-config.json` on the server filesystem. Not transmitted to any third party.
- **No database.** All signal state is in-memory. Server restart clears signals. Only Telegram config is persisted to disk.
- **Configurable slippage.** Default is 5% (500 basis points) with auto-slippage enabled. Adjustable in the trade API parameters.
- **Cooldown protection.** Auto-exit has a 45-second per-token cooldown in live mode to prevent repeated execution on the same signal.

---

## License

Built for the Ave Hackathon.

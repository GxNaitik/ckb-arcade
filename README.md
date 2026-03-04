# 🎮 CKB ARCADE

A decentralized multi-game arcade platform built on the **Nervos CKB blockchain (Testnet)**. Players connect their CKB wallet, pick from multiple arcade games, place bets using testnet CKB tokens, and receive automatic payouts — all on-chain.

## 🎯 Game Collection

| Game | Type | Min Bet | Max Bet | RTP | Description |
|------|------|---------|---------|-----|-------------|
| 🎡 **Spin to Win** | Classic | 100 CKB | 1,000 CKB | 95% | Spin a colorful wheel and win up to 10,000 CKB |
| 🎲 **CKB Dice** | Luck | 50 CKB | 500 CKB | 97% | Roll the dice and predict your luck — 2x on correct guess |
| 🪙 **Coin Flip** | Luck | 25 CKB | 1,000 CKB | 98% | Classic 50/50 coin flip — double your CKB |
| 🔢 **Number Guess** | Luck | 75 CKB | 750 CKB | 90% | Guess the number 1–10, higher risk = higher rewards |
| 🦖 **CKB Dino Run** | Skill | 200 CKB | 200 CKB | 95% | Chrome Dino-style endless runner with time-based CKB rewards |

### 🦖 CKB Dino Run — Survival Rewards

The endless runner uses a tiered reward system based on survival time:

| Tier | Survival Time | Reward |
|------|---------------|--------|
| 🥉 Tier 1 | 1 minute | 100 CKB |
| 🥈 Tier 2 | 5 minutes | 500 CKB |
| 🏆 Tier 3 | 10 minutes | 1,000 CKB |

Rewards are server-verified to prevent client-side manipulation, with daily session limits (5 per wallet) for anti-bot protection.

## 🏗️ Architecture

```
ckb_arcade/
├── frontend/                          # React + TypeScript + Vite
│   ├── src/
│   │   ├── App.tsx                    # Main app with wallet integration
│   │   ├── main.tsx                   # Entry point with CCC Provider
│   │   ├── index.css                  # Global styles
│   │   ├── components/
│   │   │   ├── ArcadeLobby.tsx        # Game selection lobby
│   │   │   ├── SpinWheel.tsx          # Spin wheel (lobby component)
│   │   │   ├── GameStats.tsx          # Game statistics display
│   │   │   └── games/
│   │   │       ├── SpinWheel.tsx      # Spin to Win game
│   │   │       ├── DiceRoll.tsx       # CKB Dice game
│   │   │       ├── CoinFlip.tsx       # Coin Flip game
│   │   │       ├── NumberGuess.tsx    # Number Guess game
│   │   │       └── EndlessRunner/     # CKB Dino Run (canvas game)
│   │   │           ├── EndlessRunner.tsx
│   │   │           ├── engine/        # Game loop engine
│   │   │           ├── systems/       # Economy, anti-cheat, CKB adapter
│   │   │           ├── ui/            # UI screens (start, HUD, game over)
│   │   │           ├── performance/   # FPS monitor, object pools
│   │   │           └── components/    # Transaction status UI
│   │   ├── constants/
│   │   │   └── games.ts              # Game definitions & categories
│   │   └── types/
│   │       └── games.ts              # TypeScript interfaces
│   ├── index.html
│   ├── vite.config.ts                # Vite + PWA config
│   ├── tailwind.config.ts            # Tailwind CSS config
│   └── package.json
├── backend/                           # Node.js + Express API
│   ├── index.js                       # Server with payout & survival verification
│   ├── .env.example
│   └── package.json
└── README.md
```

## 🛠️ Tech Stack

### Frontend
- **React 18** + **TypeScript** — UI framework with type safety
- **Vite 5** — Build tool with HMR
- **Tailwind CSS 3** — Utility-first styling with custom theme
- **@ckb-ccc/connector-react** — CKB wallet connection (JoyID, Spore, MetaMask)
- **Lucide React** — Icon library
- **PWA Support** — Installable via `vite-plugin-pwa`
- **Canvas API** — Used for the CKB Dino Run game rendering

### Backend
- **Node.js** + **Express** — REST API server
- **@ckb-ccc/core** — CKB blockchain interaction (signing, transactions)
- **CORS** + **dotenv** — Security and configuration

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18 or higher
- **npm** or **yarn**
- A CKB wallet (JoyID, Spore, etc.)
- CKB testnet tokens ([Faucet](https://faucet.nervos.org/))

### 1. Clone the Repository

```bash
git clone https://github.com/GxNaitik/ckb-learning-track.git
cd ckb-learning-track/ckb_arcade
```

### 2. Install Dependencies

```bash
# Frontend
cd frontend
npm install

# Backend
cd ../backend
npm install
```

### 3. Configure Environment

**Backend** — Create `backend/.env`:

```env
HOUSE_PRIVATE_KEY=<your_house_wallet_private_key>
PAYOUT_API_KEY=<your_api_key>
MAX_PAYOUT_CKB=10000
CKB_RPC_URL=https://testnet.ckb.dev/
PORT=8787
```

**Frontend** — Create `frontend/.env`:

```env
VITE_GAME_ADDRESS=<your_game_address_ckt1...>
VITE_PAYOUT_API_KEY=<your_api_key>
```

> **Note:** If `VITE_API_BASE` is not set, the frontend proxies API requests to `http://127.0.0.1:8787` via Vite's dev server proxy.

### 4. Run the Application

```bash
# Terminal 1 — Backend
cd backend
npm run dev          # Starts on http://localhost:8787

# Terminal 2 — Frontend
cd frontend
npm run dev          # Starts on http://localhost:3000
```

Open your browser to **http://localhost:3000**.

## 🎮 How to Play

1. **Connect Your Wallet** — Click "Connect Wallet" and approve via your CKB wallet
2. **Pick a Game** — Browse the arcade lobby, filter by category, or search
3. **Place Your Bet** — Each game has a min/max bet range in CKB
4. **Play & Win** — Game outcomes determine your winnings
5. **Receive Payouts** — Automatic on-chain payout to your wallet via the backend

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/games` | List all available games |
| `GET` | `/api/house` | House wallet address & balance (requires API key) |
| `POST` | `/api/payout` | Process payout transaction |
| `GET` | `/api/stats/:gameId?` | Game statistics (global or per-game) |
| `POST` | `/api/stats/:gameId` | Record game result |
| `GET` | `/api/player/:address/stats` | Player-specific statistics |
| `POST` | `/api/verify-survival` | Verify & claim CKB Dino Run rewards |
| `GET` | `/api/survival-stats` | Survival game monitoring stats |
| `GET` | `/health` | Health check |

### Payout Request

```bash
curl -X POST http://localhost:8787/api/payout \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"toAddress": "ckt1...", "amountCkb": 100, "betTxHash": "0x..."}'
```

## 🔒 Security

- **API key protection** on payout and house endpoints
- **Server-side reward verification** — survival rewards are computed server-side, never trusted from the client
- **Anti-bot protection** — daily session limits (5 per wallet) for the endless runner
- **Anti-cheat validation** — survival time bounds checking (1–3600s)
- **Duplicate claim prevention** — session IDs tracked to prevent double-spend
- **Fee bump retry** — automatic RBF handling for CKB transactions
- **Private keys** stored only in environment variables

## 🏗️ Building for Production

```bash
cd frontend
npm run build        # TypeScript check + Vite production build
```

Output is generated in `frontend/dist/`.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- [Nervos CKB](https://github.com/nervosnetwork/ckb) — The Layer 1 blockchain
- [CCC (CKB Connectivity Client)](https://github.com/ckb-ccc/ccc) — Wallet integration SDK
- [JoyID](https://www.joy.id/) — CKB wallet provider

---

**⚠️ Disclaimer:** This is a testnet demo project for educational purposes. All games use CKB testnet tokens with no real monetary value. Play responsibly.
=======
# ckb-arcade
An arcade place where you can play different-different games and earn money for CKB

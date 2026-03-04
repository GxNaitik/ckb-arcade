# CKB ARCADE (Frontend) — Project Overview

## What the project is
This repository is currently **a frontend-only demo** of a “Spin to Win” game UI.

It has 3 big pieces:

- **UI/Animations**: renders the wheel, segments, modal, and the page layout.
- **Wallet integration** (CCC): connects a CKB wallet in the browser and gives you a `signer`.
- **CKB Testnet transaction** ("bet"): when you click spin, the app attempts to send a CKB transfer transaction to the configured “game address”.

There is **no on-chain game contract** and **no backend** in this repo yet.

That’s why today it can do “real transfers”, but it can’t do provably-fair RNG or enforce payouts.

---

## How it is implemented (high-level)

### Entry point
- **`src/main.tsx`**
  - Bootstraps React.
  - Wraps app with `ccc.Provider` so CCC hooks can work.
  - Wraps everything in a `RootErrorBoundary` so if the wallet connector crashes, the UI still renders.

### App shell
- **`src/App.tsx`**
  - Renders:
    - Navbar (connect, disconnect, balance, address)
    - Game address input + validity badge
    - Stats cards
    - The `SpinWheel` component
    - A “last transaction hash” panel
  - Uses CCC hooks inside `AppWithCcc`:
    - `ccc.useCcc()` -> gives `wallet`, `open()`, `disconnect()`, `client`
    - `ccc.useSigner()` -> gives a `signer` for signing/sending tx
  - Fetches real values:
    - **Wallet address**: `signer.getRecommendedAddress()`
    - **Wallet balance**: `signer.getBalance()`
    - **Jackpot**: `client.getBalance([script])` where script is derived from `gameAddress`

### Spin logic and transaction
- **`src/components/SpinWheel.tsx`**
  - Renders the wheel UI.
  - On button click:
    1. Checks wallet connected.
    2. Validates `gameAddress` by calling `ccc.Address.fromString(gameAddress, signer.client)`.
       - If parsing fails => you see “Invalid game address…”
    3. Builds a CKB transfer tx using CCC high-level helpers:
       - `ccc.Transaction.from({ outputs: [{ lock: toLock }], outputsData: ['0x'] })`
       - Sets output capacity to `61 CKB` (minimum cell capacity safety)
       - Completes inputs + fee:
         - `tx.completeInputsByCapacity(signer)`
         - `tx.completeFeeBy(signer, 1000)`
       - Sends:
         - `signer.sendTransaction(tx)`
    4. After sending tx, it runs the wheel animation and picks a segment **using `Math.random()`**.
    5. Displays win/loss modal.

Important: the spin outcome is **not derived from the chain**. Only the bet transfer is on-chain.

---

## What “Game Address” means (in your current app)

### In this codebase today
“Game address” is simply:

- The **recipient address** of the bet transfer transaction.
- The **address whose balance is shown as ‘Jackpot’**.

It is NOT:
- A deployed smart contract address (there is no contract here)
- A verifiable house account with payout logic

So if you set `VITE_GAME_ADDRESS` to your own wallet address:
- Clicking spin will “bet” by transferring to yourself (you’ll pay tx fee, but funds return to you)
- Jackpot becomes your own balance
- This is a convenient test to verify the pipeline works

### Where it comes from
The `gameAddress` is loaded in this order:

1. `localStorage.getItem('gameAddress')`
2. `.env` variable `VITE_GAME_ADDRESS`
3. fallback `DEFAULT_GAME_ADDRESS` (placeholder)

That’s why you were seeing invalid address errors: the fallback placeholder may not be valid for CCC.

---

## What is real vs “demo” right now

### Real
- Wallet connect/disconnect
- Reading wallet address
- Reading wallet balance
- Building and broadcasting a real CKB testnet transfer tx (the bet)
- Showing a real tx hash and explorer link

### Demo / not trustless
- Spin randomness (`Math.random()`)
- ‘Recent Win’, ‘Players’, ‘Wagered’ cards (not derived from chain)
- “Instant payouts” claim (no payout contract exists)

---

# Ideal plan (roadmap) — from demo to a real on-chain game

## Phase 0 — Stabilize demo UX (1–2 days)
- Make bet amount configurable (e.g. `1 CKB`, `10 CKB`, etc.) but still respect minimum cell capacity.
- Show explicit network: Testnet/Mainnet, and warn if wallet is on the wrong network.
- Improve error messages:
  - insufficient balance
  - rejected by wallet
  - tx build failures
- Make the “Spin” button show state: Building tx -> Waiting signature -> Broadcasting -> Confirmed.

## Phase 1 — “Trusted enough” MVP (backend-assisted) (3–7 days)
This is what many platforms do first.

- Add a backend service that:
  - Receives the bet tx hash
  - Uses server-side RNG (or commit-reveal)
  - Pays winnings from a hot wallet (server-controlled)
  - Stores game rounds in DB
- Add an audit page:
  - Round id
  - bet tx hash
  - payout tx hash
  - RNG seed/commit

This is not fully trustless, but it’s practical.

## Phase 2 — Trustless / provably fair (smart contract) (2–6 weeks)
To be truly “provably fair” and “instant payouts”, you need contract logic.

Key components:

- **On-chain custody**: jackpot funds live in a script/contract.
- **Round state**: bet records must be trackable.
- **RNG**:
  - Commit-reveal (player commits seed, later reveals)
  - Or use a randomness beacon / oracle
  - Or use a block hash with safeguards (not perfect alone)
- **Payout enforcement**:
  - contract validates win condition and releases funds

## Phase 3 — Platform-grade features
- Player history and leaderboard (indexed from chain)
- Rate limiting / anti-spam
- Analytics dashboards
- Multi-token / FT support
- Security review + monitoring

---

# What I recommend you do right now

1. Keep your `.env` like you did:
   - `VITE_GAME_ADDRESS=<your ckt1... address>`
2. Restart dev server so Vite re-reads `.env`
3. Confirm the UI shows **VALID** for Game Address.
4. Spin once and confirm you get a tx hash.

If you want, tell me your preferred direction:

- **A)** quick demo MVP (backend-assisted payouts)
- **B)** fully trustless (contract-first)

and I’ll propose the next implementation steps accordingly.

# Weekly Development Log: CKB Arcade Security & Infrastructure Upgrade

## Overview
This week, our primary focus was on hardening the CKB Arcade ecosystem by transitioning to a provably fair gaming model, upgrading infrastructure deployments, and ensuring resilient on-chain transaction flows. We successfully bridged the gap between our local development environment and production on Vercel.

## Key Accomplishments

### 1. Provably Fair (Commit-Reveal) Implementation
- **Cryptographic Transparency:** Implemented a robust two-party commit-reveal scheme for all luck-based games (`CoinFlip`, `DiceRoll`, `SpinWheel`, `NumberGuess`). This ensures neither the player nor the house can manipulate the game's outcome.
- **Backend Flow (`/api/commit` & `/api/reveal`):** Created secure backend endpoints to handle secret generation, SHA-256 hash commitments, and XOR-based random seed generation. The backend now computes game outcomes deterministically.
- **Frontend Integration:** Built the `playCommitReveal` utility to seamlessly manage the commit-reveal flow during gameplay. Added a sleek `ProvablyFairBadge` UI component that exposes the cryptographic proofs to the player, allowing them to independently verify the fairness of every outcome.

### 2. Transaction Reliability (RBF Fee-Bumping)
- **Problem Identified:** In production, players experienced `PoolRejectedRBF` errors when attempting to place consecutive bets, as the CKB testnet mempool rejected new transactions that didn't provide a sufficient fee to replace existing pending transactions.
- **Resolution (`sendWithRetry` Utility):** Extracted transaction building logic from individual games and implemented a centralized `sendWithRetry.ts` utility. This utility automatically escalates the transaction fee rate (doubling + 1000) and retries up to 5 times when it detects RBF or duplicate transaction errors.
- **Component Updates:** Refactored all game components to utilize the new `sendWithRetry` method, resulting in cleaner code (~80 lines of duplicate tx logic removed) and a significantly smoother user experience under heavy load.

### 3. Production Deployment Synchronization
- **Environment Sync:** Resolved discrepancies where the hosted Vercel frontend was pointing to a deprecated backend URL that lacked the new commit-reveal endpoints.
- **Backend Redeployment:** Successfully redeployed the updated backend to a new Vercel instance (`backend-three-khaki-65.vercel.app`) with properly configured environment variables (`HOUSE_PRIVATE_KEY`, `PAYOUT_API_KEY`, etc.).
- **Frontend Redeployment:** Updated the `VITE_API_BASE` environment variable on the frontend's Vercel configuration to point to the new backend, ensuring the live site correctly triggers the Provably Fair logic instead of silently failing over to demo mode.

### 4. Codebase Maintenance & Security
- **Gitignore Update:** Secured the repository by ensuring `.env` files (including `.env.production`) and build artifacts are strictly excluded from version control.
- **GitHub Issue Prepared:** Drafted a comprehensive, professional GitHub issue (`GITHUB_ISSUE.md`) to solicit architectural feedback and present the project's security model for potential ecosystem grants.

## Next Steps & Roadmap
- **Atomic Payouts:** Merge the payout mechanism directly into the `/api/reveal` endpoint to establish a strictly server-authoritative model, eliminating the possibility of client-initiated payout calls.
- **On-Chain Logic Migration:** Investigate migrating the commit-reveal validation and game rules directly into CKB Lock Scripts for a fully trustless architecture.
- **Persistent Storage:** Replace the backend's in-memory session tracking with Redis or SQLite to ensure commit-reveal state and anti-cheat data persist across server restarts.
- **House Wallet Security:** Transition the single-private-key house wallet setup to a 2-of-3 Omnilock Multi-sig for enhanced fund security.

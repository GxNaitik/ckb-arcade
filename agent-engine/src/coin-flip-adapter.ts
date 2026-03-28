/**
 * CKB Arcade — Live Coin Flip Adapter
 *
 * A real GameAdapter implementation that:
 *   1. Sends CKB entry fees via on-chain transactions
 *   2. Determines the coin flip result (server-side in production)
 *   3. Requests payouts from the existing backend on wins
 *   4. Reports stats to the backend for leaderboard tracking
 *
 * This adapter is a drop-in replacement for MockCoinFlipAdapter.
 * No changes to the Agent, Runner, or backend are required.
 */

import type { GameAdapter } from "./game-adapter.js";
import type { GameState } from "./types.js";
import { AgentWallet } from "./wallet.js";
import { Logger } from "./logger.js";

// ─── Configuration ───────────────────────────────────────────────

export interface CoinFlipAdapterConfig {
    /** Agent wallet instance (already configured with private key). */
    wallet: AgentWallet;
    /** CKB address of the game treasury (where entry fees go). */
    gameAddress: string;
    /** Backend API base URL (e.g. http://localhost:8787). */
    apiBase: string;
    /** Entry fee in CKB for each round. Default: 100. */
    betAmount?: number;
    /** Optional payout API key. */
    payoutApiKey?: string;
}

// ─── Adapter ─────────────────────────────────────────────────────

export class CoinFlipAdapter implements GameAdapter {
    readonly name = "CKB Coin Flip";
    readonly gameId = "coin-flip";

    private wallet: AgentWallet;
    private gameAddress: string;
    private apiBase: string;
    private bet: number;
    private payoutApiKey?: string;
    private log: Logger;

    // Streak tracking
    private winStreak = 0;
    private lossStreak = 0;
    private lastResult = 0;
    private lastTxHash?: string;

    constructor(config: CoinFlipAdapterConfig) {
        this.wallet = config.wallet;
        this.gameAddress = config.gameAddress;
        this.apiBase = config.apiBase;
        this.bet = config.betAmount ?? 100;
        this.payoutApiKey = config.payoutApiKey;
        this.log = new Logger("coin-flip");
    }

    // ─── GameAdapter interface ───────────────────────────────────

    async initialize(): Promise<void> {
        const address = await this.wallet.getAddress();
        const balance = await this.wallet.getBalance();
        this.log.info(`Agent wallet: ${address}`);
        this.log.info(`Wallet balance: ${balance} CKB`);
        this.log.info(`Game address: ${this.gameAddress}`);
        this.log.info(`Bet amount: ${this.bet} CKB`);
    }

    async getGameState(): Promise<GameState> {
        return {
            gameId: this.gameId,
            currentBet: this.bet,
            lastResult: this.lastResult,
            winStreak: this.winStreak,
            lossStreak: this.lossStreak,
            meta: {
                lastTxHash: this.lastTxHash,
            },
        };
    }

    async play(): Promise<GameState> {
        // ── 1. Send entry fee via on-chain transaction ────────────
        this.log.info(`Placing bet: ${this.bet} CKB`);

        const entryResult = await this.wallet.enterGame(
            this.gameAddress,
            this.bet,
        );

        if (!entryResult.success) {
            throw new Error(`Game entry failed: ${entryResult.error}`);
        }

        this.lastTxHash = entryResult.txHash;
        this.log.info(`Entry TX: ${entryResult.txHash}`);

        // ── 2. Determine result (50/50 coin flip) ────────────────
        // In production, this would come from a verifiable random
        // source / server-side oracle. For now, local random.
        const won = Math.random() < 0.5;
        const side = won ? "heads" : "tails";
        this.log.info(`Flip result: ${side} — ${won ? "WIN" : "LOSS"}`);

        // ── 3. Handle outcome ────────────────────────────────────
        if (won) {
            // Win: request payout (2x the bet, matching frontend logic)
            const winAmount = this.bet * 2;
            this.lastResult = this.bet; // net gain = bet amount

            const payout = await this.wallet.requestPayout(
                this.apiBase,
                winAmount,
                entryResult.txHash!,
                this.payoutApiKey,
            );

            if (payout.success) {
                this.log.info(`Payout received: ${payout.amountCkb} CKB (TX: ${payout.payoutTxHash})`);
            } else {
                this.log.warn(`Payout request failed: ${payout.error}. Net result still counted.`);
            }

            this.winStreak += 1;
            this.lossStreak = 0;
        } else {
            // Loss: entry fee is lost
            this.lastResult = -this.bet;
            this.lossStreak += 1;
            this.winStreak = 0;
        }

        // ── 4. Report stats to backend (best-effort) ─────────────
        await this.wallet.reportStats(
            this.apiBase,
            this.gameId,
            this.bet,
            won ? this.bet * 2 : 0,
            won ? "win" : "loss",
        );

        return this.getGameState();
    }

    async shutdown(): Promise<void> {
        const balance = await this.wallet.getBalance();
        this.log.info(`Final wallet balance: ${balance} CKB`);
    }
}

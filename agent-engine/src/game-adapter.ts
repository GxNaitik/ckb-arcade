/**
 * CKB Arcade — Game Adapter Interface
 *
 * Defines the contract that each game module must implement so the
 * AgentRunner can interact with it generically. This is the
 * extensibility boundary — add a new game by implementing this
 * interface, no runner changes needed.
 */

import type { GameState } from "./types.js";

// ─── Game Adapter ────────────────────────────────────────────────

export interface GameAdapter {
    /** Human-readable name shown in logs. */
    readonly name: string;

    /** Unique game identifier (matches GameState.gameId). */
    readonly gameId: string;

    /**
     * Fetch the latest game state.
     * Called every tick to feed the agent's decision function.
     */
    getGameState(): Promise<GameState>;

    /**
     * Execute a game round (place bet, flip coin, run race, etc.).
     * Called when the agent decides "PLAY".
     * Should return the updated GameState after the round completes.
     */
    play(): Promise<GameState>;

    /**
     * Optional setup hook — called once when the runner starts.
     * Use for wallet connections, session init, etc.
     */
    initialize?(): Promise<void>;

    /**
     * Optional teardown hook — called when the runner stops.
     * Use for cleanup, disconnecting, etc.
     */
    shutdown?(): Promise<void>;
}

// ─── Mock Adapter (for testing / demo) ───────────────────────────

/**
 * A simple simulated coin-flip adapter for testing the runner
 * without a real game backend.
 */
export class MockCoinFlipAdapter implements GameAdapter {
    readonly name = "Mock Coin Flip";
    readonly gameId = "mock-coin-flip";

    private bet = 10;
    private winStreak = 0;
    private lossStreak = 0;
    private lastResult = 0;

    async getGameState(): Promise<GameState> {
        return {
            gameId: this.gameId,
            currentBet: this.bet,
            lastResult: this.lastResult,
            winStreak: this.winStreak,
            lossStreak: this.lossStreak,
        };
    }

    async play(): Promise<GameState> {
        // 50/50 coin flip simulation
        const win = Math.random() >= 0.5;

        if (win) {
            this.lastResult = this.bet;
            this.winStreak += 1;
            this.lossStreak = 0;
        } else {
            this.lastResult = -this.bet;
            this.lossStreak += 1;
            this.winStreak = 0;
        }

        return this.getGameState();
    }

    async initialize(): Promise<void> {
        // No-op for mock
    }

    async shutdown(): Promise<void> {
        // No-op for mock
    }
}

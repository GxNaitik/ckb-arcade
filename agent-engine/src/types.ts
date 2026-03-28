/**
 * CKB Arcade — Agent Engine Types
 *
 * Central type definitions. All modules import from here so the
 * type surface stays in one place and future AI-model integrations
 * can type-check against these contracts.
 */

// ─── Strategy ────────────────────────────────────────────────────
/** Determines risk appetite and decision thresholds. */
export type Strategy = "aggressive" | "conservative";

// ─── Agent Action ────────────────────────────────────────────────
/** The possible actions an agent can return from its decision fn. */
export type AgentAction = "PLAY" | "STOP" | "WAIT";

// ─── Agent Configuration ─────────────────────────────────────────
/** Immutable config supplied when creating an agent instance. */
export interface AgentConfig {
    /** Unique identifier for this agent instance. */
    id: string;
    /** Starting balance (in CKB). */
    initialBalance: number;
    /** Risk strategy — controls how the decision engine behaves. */
    strategy: Strategy;
    /** Target profit percentage (e.g. 0.20 = 20 %). */
    profitTarget: number;
    /** Maximum tolerable loss percentage (e.g. 0.15 = 15 %). */
    stopLoss: number;
}

// ─── Agent State ─────────────────────────────────────────────────
/** Serializable runtime state persisted to `memory.json`. */
export interface AgentState {
    /** Agent configuration snapshot. */
    config: AgentConfig;
    /** Current balance after wins / losses. */
    balance: number;
    /** Number of games played in this session. */
    gamesPlayed: number;
    /** Number of games won. */
    wins: number;
    /** Number of games lost. */
    losses: number;
    /** ISO-8601 timestamp of last activity. */
    lastUpdated: string;
    /** Whether the agent has voluntarily stopped. */
    halted: boolean;
    /** Optional reason the agent halted. */
    haltReason?: string;
    /** Running history of decisions for audit / replay. */
    decisionLog: DecisionLogEntry[];
}

// ─── Decision Log ────────────────────────────────────────────────
/** A single recorded decision and the game-state snapshot that led to it. */
export interface DecisionLogEntry {
    timestamp: string;
    gameState: GameState;
    action: AgentAction;
    balanceBefore: number;
    balanceAfter: number;
}

// ─── Game State ──────────────────────────────────────────────────
/**
 * Minimal representation of the current game state passed to the
 * agent. This surface is intentionally small so it's easy for
 * different game modules (Coin Flip, Dino Run, etc.) to produce.
 */
export interface GameState {
    /** Name / identifier of the active game. */
    gameId: string;
    /** Amount wagered in the current round. */
    currentBet: number;
    /** Net result of the most recent round (positive = win). */
    lastResult: number;
    /** Number of consecutive wins. */
    winStreak: number;
    /** Number of consecutive losses. */
    lossStreak: number;
    /** Any extra game-specific metadata. */
    meta?: Record<string, unknown>;
}

/**
 * CKB Arcade — Agent Engine
 *
 * Public barrel export. Consumers import from here:
 *
 *   import { Agent, AgentRunner, WalletManager } from "ckb-arcade-agent-engine";
 *   import type { AgentConfig, GameState } from "ckb-arcade-agent-engine";
 */

// Core
export { Agent } from "./agent.js";
export { AgentRunner } from "./runner.js";
export { Logger } from "./logger.js";
export { AgentWallet } from "./wallet.js";
export { WalletManager } from "./wallet-manager.js";

// Strategy & Scoring
export {
    evaluate,
    explainDecision,
    getPerformanceScore,
    getEffectiveStrategy,
} from "./strategy.js";
export { computeScore, computeBetSize } from "./scoring.js";
export type { PerformanceScore } from "./scoring.js";

// Persistence
export { loadState, saveState, clearState } from "./persistence.js";

// Game Adapters
export type { GameAdapter } from "./game-adapter.js";
export { MockCoinFlipAdapter } from "./game-adapter.js";
export { CoinFlipAdapter } from "./coin-flip-adapter.js";

// Contracts / Lock Scripts
export {
    createAgentLockPolicy,
    buildAgentLockArgs,
    buildAgentLockTransaction,
} from "./contracts/agent-lock-policy.js";
export type { AgentLockPolicyConfig } from "./contracts/agent-lock-policy.js";

// Types
export type { RunnerConfig, RunnerHooks } from "./runner.js";
export type { LoggerOptions, LogLevel } from "./logger.js";
export type { WalletConfig, EnterGameResult, PayoutResult } from "./wallet.js";
export type {
    WalletManagerConfig,
    SpendingConstraints,
    SendTransactionResult,
    TransactionRecord,
    WalletState,
    KeystoreEntry,
    LockScriptPolicy,
} from "./wallet-manager.js";
export type { CoinFlipAdapterConfig } from "./coin-flip-adapter.js";
export type {
    AgentAction,
    AgentConfig,
    AgentState,
    DecisionLogEntry,
    GameState,
    Strategy,
} from "./types.js";

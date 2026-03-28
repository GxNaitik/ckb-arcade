/**
 * CKB Arcade — Agent Class
 *
 * Orchestrates config, state, strategy evaluation, and persistence.
 * All side-effects (disk I/O) are delegated to the persistence
 * layer; all decision logic lives in strategy.ts.
 */

import { resolve } from "node:path";
import type {
    AgentAction,
    AgentConfig,
    AgentState,
    DecisionLogEntry,
    GameState,
} from "./types.js";
import { evaluate, explainDecision } from "./strategy.js";
import { loadState, saveState, clearState } from "./persistence.js";

export class Agent {
    private state: AgentState;
    private memoryPath: string;

    // ─── Accessors ───────────────────────────────────────────────
    get id(): string {
        return this.state.config.id;
    }
    get balance(): number {
        return this.state.balance;
    }
    get strategy(): AgentConfig["strategy"] {
        return this.state.config.strategy;
    }
    get profitTarget(): number {
        return this.state.config.profitTarget;
    }
    get stopLoss(): number {
        return this.state.config.stopLoss;
    }
    get gamesPlayed(): number {
        return this.state.gamesPlayed;
    }
    get isHalted(): boolean {
        return this.state.halted;
    }
    get snapshot(): Readonly<AgentState> {
        return structuredClone(this.state);
    }

    // ─── Construction ────────────────────────────────────────────

    private constructor(state: AgentState, memoryPath: string) {
        this.state = state;
        this.memoryPath = memoryPath;
    }

    /**
     * Create a brand-new agent from a config object.
     * Immediately persists the initial state.
     */
    static async create(
        config: AgentConfig,
        memoryPath?: string,
    ): Promise<Agent> {
        const initialState: AgentState = {
            config,
            balance: config.initialBalance,
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            lastUpdated: new Date().toISOString(),
            halted: false,
            decisionLog: [],
        };

        const path = memoryPath ?? Agent.defaultMemoryPath();
        const agent = new Agent(initialState, path);
        await agent.persist();
        return agent;
    }

    /**
     * Resume an existing agent from persisted state.
     * Throws if no saved state is found.
     */
    static async resume(memoryPath?: string): Promise<Agent> {
        const path = memoryPath ?? Agent.defaultMemoryPath();
        const state = await loadState(path);
        if (!state) {
            throw new Error(
                `No saved agent state found at "${path}". Use Agent.create() first.`,
            );
        }
        return new Agent(state, path);
    }

    // ─── Core Decision Logic ────────────────────────────────────

    /**
     * Decide the next action given the current game state.
     *
     * Side-effects:
     *  - Updates balance based on `gameState.lastResult`.
     *  - Records the decision in `decisionLog`.
     *  - Persists updated state to disk.
     */
    async decideNextAction(gameState: GameState): Promise<AgentAction> {
        if (this.state.halted) {
            return "STOP";
        }

        // Apply the latest result to the balance.
        const balanceBefore = this.state.balance;
        this.state.balance += gameState.lastResult;
        this.state.gamesPlayed += 1;

        if (gameState.lastResult > 0) {
            this.state.wins += 1;
        } else if (gameState.lastResult < 0) {
            this.state.losses += 1;
        }

        // Evaluate strategy.
        const action = evaluate(this.state, gameState);

        // Record the decision.
        const entry: DecisionLogEntry = {
            timestamp: new Date().toISOString(),
            gameState: structuredClone(gameState),
            action,
            balanceBefore,
            balanceAfter: this.state.balance,
        };
        this.state.decisionLog.push(entry);

        // Mark halted if the agent decided to stop.
        if (action === "STOP") {
            this.state.halted = true;
            this.state.haltReason = explainDecision(this.state, gameState, action);
        }

        this.state.lastUpdated = new Date().toISOString();
        await this.persist();

        return action;
    }

    // ─── Utility ─────────────────────────────────────────────────

    /** Get a human-readable explanation of a hypothetical decision. */
    explain(gameState: GameState): string {
        const action = evaluate(this.state, gameState);
        return explainDecision(this.state, gameState, action);
    }

    /** Reset the agent to its initial state (wipes history). */
    async reset(): Promise<void> {
        this.state.balance = this.state.config.initialBalance;
        this.state.gamesPlayed = 0;
        this.state.wins = 0;
        this.state.losses = 0;
        this.state.halted = false;
        this.state.haltReason = undefined;
        this.state.decisionLog = [];
        this.state.lastUpdated = new Date().toISOString();
        await this.persist();
    }

    /** Wipe persisted state from disk entirely. */
    async destroy(): Promise<void> {
        await clearState(this.memoryPath);
    }

    /** P&L summary for quick inspection. */
    getSummary(): {
        profitPercent: number;
        lossPercent: number;
        netResult: number;
        gamesPlayed: number;
        winRate: number;
    } {
        const { balance, gamesPlayed, wins } = this.state;
        const initial = this.state.config.initialBalance;
        const net = balance - initial;
        return {
            profitPercent: net > 0 ? (net / initial) * 100 : 0,
            lossPercent: net < 0 ? (Math.abs(net) / initial) * 100 : 0,
            netResult: net,
            gamesPlayed,
            winRate: gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0,
        };
    }

    // ─── Private ─────────────────────────────────────────────────

    private async persist(): Promise<void> {
        await saveState(this.state, this.memoryPath);
    }

    private static defaultMemoryPath(): string {
        return resolve(import.meta.dirname ?? ".", "..", "data", "memory.json");
    }
}

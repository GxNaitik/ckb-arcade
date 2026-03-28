/**
 * CKB Arcade — Agent Loop Runner
 *
 * Production-safe interval loop that:
 *   1. Polls the game adapter for current state.
 *   2. Calls agent.decideNextAction().
 *   3. Routes the action → PLAY / WAIT / STOP.
 *   4. Logs everything (console + file).
 *   5. Handles errors gracefully (never crashes).
 *
 * The runner is fully configurable and designed for extension:
 *   - Swap the GameAdapter to target any game.
 *   - Add lifecycle hooks (onTick, onPlay, onStop, onError).
 *   - Adjust interval, max-error threshold, etc.
 */

import { Agent } from "./agent.js";
import { Logger } from "./logger.js";
import type { GameAdapter } from "./game-adapter.js";
import type { AgentAction, AgentConfig, GameState } from "./types.js";

// ─── Runner Configuration ────────────────────────────────────────

export interface RunnerConfig {
    /** Agent configuration. */
    agentConfig: AgentConfig;

    /** Game adapter instance. */
    gameAdapter: GameAdapter;

    /** Milliseconds between ticks. Default: 10 000 (10 s). */
    intervalMs?: number;

    /** Path to agent memory file. Uses default if omitted. */
    memoryPath?: string;

    /**
     * Maximum consecutive errors before auto-halting.
     * Set to 0 for unlimited. Default: 10.
     */
    maxConsecutiveErrors?: number;

    /** Resume an existing agent instead of creating fresh. */
    resume?: boolean;

    /** Minimum log level. Default: "INFO". */
    logLevel?: "DEBUG" | "INFO" | "WARN" | "ERROR";
}

// ─── Lifecycle Hooks ─────────────────────────────────────────────

export interface RunnerHooks {
    /** Called before every tick. Return `false` to skip this tick. */
    onBeforeTick?: (tick: number) => Promise<boolean | void>;
    /** Called after every tick with the action that was taken. */
    onAfterTick?: (tick: number, action: AgentAction, gameState: GameState) => Promise<void>;
    /** Called when the agent decides PLAY and the game round completes. */
    onPlay?: (gameState: GameState) => Promise<void>;
    /** Called when the runner stops (any reason). */
    onStop?: (reason: string) => Promise<void>;
    /** Called when an error occurs during a tick. */
    onError?: (error: Error, tick: number) => Promise<void>;
}

// ─── Runner Class ────────────────────────────────────────────────

export class AgentRunner {
    private agent: Agent | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;
    private running = false;
    private tick = 0;
    private consecutiveErrors = 0;

    private readonly config: Required<Pick<
        RunnerConfig,
        "agentConfig" | "gameAdapter" | "intervalMs" | "maxConsecutiveErrors" | "logLevel"
    >> & Pick<RunnerConfig, "memoryPath" | "resume">;

    private readonly hooks: RunnerHooks;
    private readonly log: Logger;

    constructor(config: RunnerConfig, hooks: RunnerHooks = {}) {
        this.config = {
            agentConfig: config.agentConfig,
            gameAdapter: config.gameAdapter,
            intervalMs: config.intervalMs ?? 10_000,
            memoryPath: config.memoryPath,
            maxConsecutiveErrors: config.maxConsecutiveErrors ?? 10,
            resume: config.resume,
            logLevel: config.logLevel ?? "INFO",
        };
        this.hooks = hooks;
        this.log = new Logger("runner", { minLevel: this.config.logLevel });
    }

    // ─── Public API ──────────────────────────────────────────────

    /** Start the agent loop. Resolves when the loop exits. */
    async start(): Promise<void> {
        if (this.running) {
            this.log.warn("Runner already active — ignoring start()");
            return;
        }

        this.log.info("═══════════════════════════════════════════");
        this.log.info("  CKB Arcade — Agent Runner Starting");
        this.log.info("═══════════════════════════════════════════");

        // ── Initialize game adapter ────────────────────────────────
        const adapter = this.config.gameAdapter;
        if (adapter.initialize) {
            this.log.info(`Initializing game adapter: ${adapter.name}`);
            await adapter.initialize();
        }

        // ── Create or resume agent ────────────────────────────────
        if (this.config.resume) {
            this.log.info("Resuming agent from persisted state…");
            this.agent = await Agent.resume(this.config.memoryPath);
        } else {
            this.log.info("Creating fresh agent instance…");
            this.agent = await Agent.create(
                this.config.agentConfig,
                this.config.memoryPath,
            );
        }

        this.logAgentSummary();
        this.running = true;
        this.tick = 0;
        this.consecutiveErrors = 0;

        this.log.info(
            `Loop started — interval ${this.config.intervalMs}ms ` +
            `(${this.config.intervalMs / 1000}s)`,
        );

        // ── Start interval ────────────────────────────────────────
        // Run tick 0 immediately, then every intervalMs.
        await this.executeTick();

        if (this.running) {
            this.timer = setInterval(() => {
                this.executeTick().catch((err) => {
                    // This catch is a last-resort safety net — executeTick
                    // already handles its own errors internally.
                    this.log.error("Unhandled error escaped tick", err);
                });
            }, this.config.intervalMs);
        }
    }

    /** Gracefully stop the loop. */
    async stop(reason = "Manual stop"): Promise<void> {
        if (!this.running) return;

        this.running = false;

        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        // Teardown adapter
        const adapter = this.config.gameAdapter;
        if (adapter.shutdown) {
            await adapter.shutdown();
        }

        this.log.info("───────────────────────────────────────────");
        this.log.info(`  Runner stopped: ${reason}`);
        this.logAgentSummary();
        this.log.info("───────────────────────────────────────────");

        if (this.hooks.onStop) {
            await this.hooks.onStop(reason);
        }
    }

    /** Whether the runner is currently active. */
    get isRunning(): boolean {
        return this.running;
    }

    /** Current tick number. */
    get currentTick(): number {
        return this.tick;
    }

    // ─── Core Loop ───────────────────────────────────────────────

    private async executeTick(): Promise<void> {
        if (!this.running || !this.agent) return;

        this.tick += 1;
        const tickLabel = `Tick #${this.tick}`;

        try {
            // ── Pre-tick hook ──────────────────────────────────────
            if (this.hooks.onBeforeTick) {
                const proceed = await this.hooks.onBeforeTick(this.tick);
                if (proceed === false) {
                    this.log.debug(`${tickLabel} skipped by onBeforeTick hook`);
                    return;
                }
            }

            // ── Get game state ─────────────────────────────────────
            const adapter = this.config.gameAdapter;
            const gameState = await adapter.getGameState();

            this.log.debug(`${tickLabel} — Game state`, gameState);

            // ── Agent decision ─────────────────────────────────────
            const action = await this.agent.decideNextAction(gameState);
            this.consecutiveErrors = 0; // reset on success

            this.log.info(
                `${tickLabel} → ${action}  |  ` +
                `Balance: ${this.agent.balance.toFixed(2)} CKB  |  ` +
                `Games: ${this.agent.gamesPlayed}`,
            );

            // ── Route action ───────────────────────────────────────
            switch (action) {
                case "PLAY": {
                    this.log.info(`${tickLabel} — Triggering game: ${adapter.name}`);
                    const resultState = await adapter.play();
                    this.log.info(
                        `${tickLabel} — Round result: ${resultState.lastResult >= 0 ? "+" : ""}${resultState.lastResult} CKB`,
                    );
                    if (this.hooks.onPlay) {
                        await this.hooks.onPlay(resultState);
                    }
                    break;
                }

                case "WAIT": {
                    this.log.info(
                        `${tickLabel} — Agent is waiting (cooldown). ` +
                        `Will re-evaluate next tick.`,
                    );
                    break;
                }

                case "STOP": {
                    const summary = this.agent.getSummary();
                    this.log.info(
                        `${tickLabel} — Agent decided to STOP.  ` +
                        `Net: ${summary.netResult >= 0 ? "+" : ""}${summary.netResult.toFixed(2)} CKB  |  ` +
                        `Win rate: ${summary.winRate.toFixed(1)}%`,
                    );
                    await this.stop("Agent decision: STOP");
                    return;
                }
            }

            // ── Post-tick hook ─────────────────────────────────────
            if (this.hooks.onAfterTick) {
                await this.hooks.onAfterTick(this.tick, action, gameState);
            }

        } catch (err) {
            this.consecutiveErrors += 1;
            const error = err instanceof Error ? err : new Error(String(err));

            this.log.error(
                `${tickLabel} — Error (${this.consecutiveErrors}/${this.config.maxConsecutiveErrors || "∞"}): ${error.message}`,
                error,
            );

            if (this.hooks.onError) {
                await this.hooks.onError(error, this.tick);
            }

            // Auto-halt after too many consecutive errors
            if (
                this.config.maxConsecutiveErrors > 0 &&
                this.consecutiveErrors >= this.config.maxConsecutiveErrors
            ) {
                this.log.error(
                    `Max consecutive errors reached (${this.config.maxConsecutiveErrors}). Halting.`,
                );
                await this.stop("Max consecutive errors exceeded");
            }
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────

    private logAgentSummary(): void {
        if (!this.agent) return;
        const s = this.agent.getSummary();
        this.log.info(
            `  Agent: ${this.agent.id}  |  Strategy: ${this.agent.strategy}  |  ` +
            `Balance: ${this.agent.balance.toFixed(2)} CKB`,
        );
        this.log.info(
            `  Games: ${s.gamesPlayed}  |  Win rate: ${s.winRate.toFixed(1)}%  |  ` +
            `Net: ${s.netResult >= 0 ? "+" : ""}${s.netResult.toFixed(2)} CKB`,
        );
    }
}

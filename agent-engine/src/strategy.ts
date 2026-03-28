/**
 * CKB Arcade — Adaptive Strategy Engine
 *
 * AI-like decision logic that adapts over time based on performance
 * scores. Replaces static thresholds with dynamic, scoring-driven
 * decisions.
 *
 * Key behaviors:
 *   - Automatic strategy switching (aggressive ↔ conservative)
 *     based on win rate, momentum, and streak analysis
 *   - Graduated responses instead of binary PLAY/STOP
 *   - Tilt detection — recognizes erratic behavior patterns
 *   - Score-aware cooldown periods after losses
 *   - Dynamic risk tolerance that evolves with experience
 *
 * This file remains the primary integration point for future AI
 * models — swap or augment `evaluate()` without touching the
 * Agent class.
 */

import type { AgentAction, AgentState, GameState, Strategy } from "./types.js";
import { computeScore, type PerformanceScore } from "./scoring.js";

// ─── Strategy Thresholds ─────────────────────────────────────────
// These are still used as baseline guardrails, but the adaptive
// layer overrides them when the scoring engine has enough data.

interface StrategyThresholds {
    /** Max consecutive losses before forcing a WAIT. */
    maxLossStreak: number;
    /** Min consecutive wins to keep riding the streak. */
    minWinStreakToContinue: number;
    /** Fraction of remaining balance below which we STOP early. */
    emergencyBalanceFraction: number;
    /** How many rounds to WAIT after a losing streak before resuming. */
    cooldownRounds: number;
}

const THRESHOLDS: Record<Strategy, StrategyThresholds> = {
    aggressive: {
        maxLossStreak: 5,
        minWinStreakToContinue: 1,
        emergencyBalanceFraction: 0.1,
        cooldownRounds: 1,
    },
    conservative: {
        maxLossStreak: 2,
        minWinStreakToContinue: 3,
        emergencyBalanceFraction: 0.25,
        cooldownRounds: 3,
    },
};

// ─── Adaptive Thresholds ─────────────────────────────────────────
// Dynamically adjust thresholds based on performance scores.

function adaptThresholds(
    base: StrategyThresholds,
    score: PerformanceScore,
): StrategyThresholds {
    // Start with a copy of base thresholds
    const adapted = { ...base };

    // Hot streak → relax loss streak tolerance (ride the wave)
    if (score.streakHeat > 0.5) {
        adapted.maxLossStreak = Math.min(base.maxLossStreak + 2, 8);
        adapted.cooldownRounds = Math.max(base.cooldownRounds - 1, 1);
    }

    // Cold streak → tighten everything
    if (score.streakHeat < -0.5) {
        adapted.maxLossStreak = Math.max(base.maxLossStreak - 1, 1);
        adapted.cooldownRounds = base.cooldownRounds + 1;
        adapted.emergencyBalanceFraction = Math.min(
            base.emergencyBalanceFraction + 0.05,
            0.4,
        );
    }

    // High volatility → play it safer
    if (score.volatility > 0.6) {
        adapted.maxLossStreak = Math.max(adapted.maxLossStreak - 1, 1);
        adapted.emergencyBalanceFraction = Math.min(
            adapted.emergencyBalanceFraction + 0.05,
            0.4,
        );
    }

    // High confidence + positive momentum → loosen up
    if (score.confidence > 0.7 && score.momentum > 0.3) {
        adapted.emergencyBalanceFraction = Math.max(
            adapted.emergencyBalanceFraction - 0.05,
            0.05,
        );
    }

    return adapted;
}

// ─── Tilt Detection ─────────────────────────────────────────────
// "Tilt" = emotional, irrational play pattern. Detected when:
//   - High volatility + negative momentum + low win rate
//   - Means the agent should cool down before continuing

function detectTilt(score: PerformanceScore): boolean {
    return (
        score.volatility > 0.5 &&
        score.momentum < -0.2 &&
        score.emaWinRate < 0.4
    );
}

// ─── Core Evaluation ─────────────────────────────────────────────

/**
 * Adaptive evaluation function.
 *
 * Decision priority (highest → lowest):
 *  1. Hard stop — loss exceeds stop-loss threshold
 *  2. Target reached — profit meets or exceeds target
 *  3. Emergency floor — balance critically low (adaptive)
 *  4. Tilt detection — agent is in an erratic pattern
 *  5. Loss-streak cooldown — adaptive threshold
 *  6. Momentum-based caution — downward trend suggests WAIT
 *  7. Default — PLAY
 *
 * The function also computes the performance score and suggested
 * strategy, which the Agent class can use for strategy switching.
 */
export function evaluate(
    agentState: AgentState,
    gameState: GameState,
): AgentAction {
    const { config, balance } = agentState;
    const { initialBalance, profitTarget, stopLoss } = config;

    // Compute the performance score
    const score = computeScore(agentState, gameState);

    // Use the scoring engine's suggested strategy (or config strategy
    // if too early for meaningful scores)
    const activeStrategy =
        agentState.gamesPlayed >= 5
            ? score.suggestedStrategy
            : config.strategy;

    const baseThresholds = THRESHOLDS[activeStrategy];
    const thresholds = adaptThresholds(baseThresholds, score);

    // ── 1. Hard stop-loss ──────────────────────────────────────────
    const lossPercent = (initialBalance - balance) / initialBalance;
    if (lossPercent >= stopLoss) {
        return "STOP";
    }

    // ── 2. Profit target ──────────────────────────────────────────
    const profitPercent = (balance - initialBalance) / initialBalance;
    if (profitPercent >= profitTarget) {
        return "STOP";
    }

    // ── 3. Emergency balance floor (adaptive) ─────────────────────
    if (balance <= initialBalance * thresholds.emergencyBalanceFraction) {
        return "STOP";
    }

    // ── 4. Tilt detection ─────────────────────────────────────────
    if (detectTilt(score) && agentState.gamesPlayed >= 5) {
        return "WAIT";
    }

    // ── 5. Loss-streak cooldown (adaptive) ────────────────────────
    if (gameState.lossStreak >= thresholds.maxLossStreak) {
        return "WAIT";
    }

    // ── 6. Momentum-based caution ─────────────────────────────────
    // If momentum is strongly negative AND confidence is high enough
    // to trust the signal, pause for a round
    if (
        score.momentum < -0.5 &&
        score.confidence > 0.5 &&
        agentState.gamesPlayed >= 8
    ) {
        return "WAIT";
    }

    // ── 7. Default — PLAY ─────────────────────────────────────────
    return "PLAY";
}

/**
 * Get the full performance score for the current state.
 * Exposed so the Agent/Runner can log it and track adaptation.
 */
export function getPerformanceScore(
    agentState: AgentState,
    gameState: GameState,
): PerformanceScore {
    return computeScore(agentState, gameState);
}

/**
 * Determine the effective strategy the evaluate function would use.
 * Useful for UI display and logging.
 */
export function getEffectiveStrategy(
    agentState: AgentState,
    gameState: GameState,
): Strategy {
    if (agentState.gamesPlayed < 5) return agentState.config.strategy;
    const score = computeScore(agentState, gameState);
    return score.suggestedStrategy;
}

/**
 * Generate a human-readable explanation of WHY the agent chose a
 * particular action. Enhanced with scoring insights.
 */
export function explainDecision(
    agentState: AgentState,
    gameState: GameState,
    action: AgentAction,
): string {
    const { config, balance } = agentState;
    const { initialBalance, profitTarget, stopLoss, strategy } = config;
    const score = computeScore(agentState, gameState);

    const lossPercent = ((initialBalance - balance) / initialBalance) * 100;
    const profitPercent = ((balance - initialBalance) / initialBalance) * 100;

    const activeStrategy =
        agentState.gamesPlayed >= 5 ? score.suggestedStrategy : strategy;

    const thresholds = adaptThresholds(THRESHOLDS[activeStrategy], score);

    const strategyNote =
        activeStrategy !== strategy
            ? ` [auto-switched: ${strategy} → ${activeStrategy}]`
            : "";

    switch (action) {
        case "STOP": {
            if (lossPercent >= stopLoss * 100) {
                return (
                    `STOP — loss of ${lossPercent.toFixed(1)}% exceeds stop-loss ` +
                    `(${(stopLoss * 100).toFixed(1)}%).${strategyNote}`
                );
            }
            if (profitPercent >= profitTarget * 100) {
                return (
                    `STOP — profit of ${profitPercent.toFixed(1)}% meets target ` +
                    `(${(profitTarget * 100).toFixed(1)}%).${strategyNote}`
                );
            }
            return (
                `STOP — balance critically low (floor at ` +
                `${(thresholds.emergencyBalanceFraction * 100).toFixed(0)}%).${strategyNote}`
            );
        }
        case "WAIT": {
            if (detectTilt(score)) {
                return (
                    `WAIT — tilt detected (volatility: ${(score.volatility * 100).toFixed(0)}%, ` +
                    `momentum: ${(score.momentum * 100).toFixed(0)}%, ` +
                    `EMA win-rate: ${(score.emaWinRate * 100).toFixed(1)}%). ` +
                    `Cooling down.${strategyNote}`
                );
            }
            if (score.momentum < -0.5 && score.confidence > 0.5) {
                return (
                    `WAIT — strong downward momentum (${(score.momentum * 100).toFixed(0)}%) ` +
                    `with ${(score.confidence * 100).toFixed(0)}% confidence. ` +
                    `Pausing.${strategyNote}`
                );
            }
            return (
                `WAIT — ${gameState.lossStreak} consecutive losses hit cooldown ` +
                `(adaptive threshold: ${thresholds.maxLossStreak}).${strategyNote}`
            );
        }
        case "PLAY": {
            return (
                `PLAY — P&L at ${profitPercent.toFixed(1)}%, EMA win-rate ` +
                `${(score.emaWinRate * 100).toFixed(1)}%, momentum ` +
                `${score.momentum > 0 ? "+" : ""}${(score.momentum * 100).toFixed(0)}%. ` +
                `Continuing.${strategyNote}`
            );
        }
    }
}

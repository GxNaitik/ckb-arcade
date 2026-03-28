/**
 * CKB Arcade — Performance Scoring Engine
 *
 * Lightweight AI-like scoring system that tracks agent performance
 * across multiple dimensions and adapts over time. No external APIs
 * needed — all computations are local.
 *
 * Metrics computed:
 *   - EMA win-rate (exponential moving average — weights recent games)
 *   - Momentum score (are we trending up or down?)
 *   - Volatility (how erratic are the results?)
 *   - Confidence level (how sure should the agent be?)
 *   - Streak heat (hot vs cold streak detection)
 *   - Kelly criterion bet fraction (optimal bet sizing)
 *
 * The scoring engine is stateless — it reads from AgentState and
 * GameState and returns a PerformanceScore snapshot.
 */

import type { AgentState, GameState, DecisionLogEntry } from "./types.js";

// ─── Types ───────────────────────────────────────────────────────

/** Full performance snapshot — produced every tick. */
export interface PerformanceScore {
    /** EMA-weighted win rate (0..1). More sensitive to recent games. */
    emaWinRate: number;
    /** Raw lifetime win rate (0..1). */
    rawWinRate: number;
    /** Recent win rate over the last N games (0..1). */
    recentWinRate: number;
    /** Momentum: positive = trending up, negative = trending down (-1..1). */
    momentum: number;
    /** Volatility of results (0 = stable, 1 = chaotic). */
    volatility: number;
    /** Agent confidence (0..1). High when consistent, low when erratic. */
    confidence: number;
    /** Streak heat: >0 = hot (winning), <0 = cold (losing), 0 = neutral. */
    streakHeat: number;
    /** Kelly criterion optimal bet fraction (0..1). */
    kellyFraction: number;
    /** Suggested strategy based on current scores. */
    suggestedStrategy: "aggressive" | "conservative";
    /** Human-readable scoring explanation. */
    explanation: string;
}

// ─── Constants ───────────────────────────────────────────────────

/** Number of recent games to use for "recent" metrics. */
const RECENT_WINDOW = 10;

/** EMA smoothing factor (higher = more weight on recent games). */
const EMA_ALPHA = 0.3;

/** Minimum games before scoring is meaningful. */
const MIN_GAMES_FOR_SCORING = 3;

// ─── Core Scoring Functions ─────────────────────────────────────

/**
 * Calculate EMA win rate from the decision log.
 * EMA gives exponentially more weight to recent results.
 */
function computeEmaWinRate(log: DecisionLogEntry[]): number {
    if (log.length === 0) return 0.5; // neutral prior

    let ema = 0.5; // start with 50/50 prior
    for (const entry of log) {
        const won = entry.balanceAfter > entry.balanceBefore ? 1 : 0;
        ema = EMA_ALPHA * won + (1 - EMA_ALPHA) * ema;
    }
    return ema;
}

/**
 * Win rate over the most recent N games.
 */
function computeRecentWinRate(log: DecisionLogEntry[], window: number): number {
    if (log.length === 0) return 0.5;

    const recent = log.slice(-window);
    const wins = recent.filter((e) => e.balanceAfter > e.balanceBefore).length;
    return wins / recent.length;
}

/**
 * Momentum — slope of the recent P&L curve.
 * Uses linear regression over the recent window.
 * Returns a value in [-1, 1].
 */
function computeMomentum(log: DecisionLogEntry[], window: number): number {
    if (log.length < 2) return 0;

    const recent = log.slice(-window);
    const n = recent.length;
    if (n < 2) return 0;

    // Compute P&L deltas
    const deltas = recent.map((e) => e.balanceAfter - e.balanceBefore);

    // Simple linear regression: y = mx + b, we want the slope m
    const xMean = (n - 1) / 2;
    const yMean = deltas.reduce((a, b) => a + b, 0) / n;

    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
        num += (i - xMean) * (deltas[i] - yMean);
        den += (i - xMean) ** 2;
    }

    const slope = den === 0 ? 0 : num / den;

    // Normalize slope to [-1, 1] using tanh
    return Math.tanh(slope / 50);
}

/**
 * Volatility — standard deviation of recent P&L results.
 * Normalized to [0, 1] using the bet size as reference.
 */
function computeVolatility(
    log: DecisionLogEntry[],
    window: number,
    currentBet: number,
): number {
    if (log.length < 2) return 0;

    const recent = log.slice(-window);
    const deltas = recent.map((e) => e.balanceAfter - e.balanceBefore);
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    const variance =
        deltas.reduce((sum, d) => sum + (d - mean) ** 2, 0) / deltas.length;
    const stdDev = Math.sqrt(variance);

    // Normalize: stdDev relative to bet size
    const ref = Math.max(currentBet, 1);
    return Math.min(stdDev / (ref * 2), 1);
}

/**
 * Streak heat — detects hot and cold streaks.
 *
 * Positive = hot (winning streak), negative = cold (losing streak).
 * Magnitude grows exponentially with streak length.
 */
function computeStreakHeat(gameState: GameState): number {
    if (gameState.winStreak > 0) {
        // Hot: exponential growth, capped at 1.0
        return Math.min(1 - Math.exp(-gameState.winStreak * 0.4), 1);
    }
    if (gameState.lossStreak > 0) {
        // Cold: exponential decay, capped at -1.0
        return -Math.min(1 - Math.exp(-gameState.lossStreak * 0.4), 1);
    }
    return 0;
}

/**
 * Confidence — how reliable are the scores?
 *
 * High when: many games played, low volatility, consistent results.
 * Low when: few games, high volatility, erratic results.
 */
function computeConfidence(
    gamesPlayed: number,
    volatility: number,
    emaWinRate: number,
): number {
    // Experience factor: grows with games played, saturates around 30
    const experience = 1 - Math.exp(-gamesPlayed / 15);

    // Stability factor: higher when volatility is low
    const stability = 1 - volatility;

    // Win-rate deviation from 50% — extremes increase confidence
    const conviction = Math.abs(emaWinRate - 0.5) * 2;

    // Weighted average
    return Math.min(
        experience * 0.4 + stability * 0.35 + conviction * 0.25,
        1,
    );
}

/**
 * Kelly Criterion — optimal bet fraction.
 *
 * f* = (bp - q) / b
 * where:
 *   b = odds (net payout per unit wagered, for coin flip b=1)
 *   p = probability of winning (emaWinRate)
 *   q = probability of losing (1 - p)
 *
 * Clamped to [0, 0.25] for safety (quarter-Kelly is standard).
 */
function computeKellyFraction(emaWinRate: number, odds = 1): number {
    const p = emaWinRate;
    const q = 1 - p;
    const kelly = (odds * p - q) / odds;

    // Quarter-Kelly for safety, clamped to [0, 0.25]
    return Math.max(0, Math.min(kelly * 0.25, 0.25));
}

/**
 * Suggest strategy based on current performance metrics.
 *
 * Aggressive when: high win rate, positive momentum, hot streak.
 * Conservative when: low win rate, negative momentum, cold streak.
 */
function suggestStrategy(
    emaWinRate: number,
    momentum: number,
    streakHeat: number,
    confidence: number,
): "aggressive" | "conservative" {
    // Weighted composite score: 0 = very conservative, 1 = very aggressive
    const score =
        emaWinRate * 0.35 +           // Win rate dominates
        (momentum + 1) / 2 * 0.25 +  // Momentum normalized to [0,1]
        (streakHeat + 1) / 2 * 0.20 + // Streak heat normalized to [0,1]
        confidence * 0.20;             // Higher confidence allows aggression

    // Switch point at 0.55 — slightly biased toward conservative
    return score >= 0.55 ? "aggressive" : "conservative";
}

/**
 * Generate a human-readable explanation of the scoring.
 */
function buildExplanation(score: PerformanceScore, gamesPlayed: number): string {
    const parts: string[] = [];

    if (gamesPlayed < MIN_GAMES_FOR_SCORING) {
        parts.push(`Early phase (${gamesPlayed}/${MIN_GAMES_FOR_SCORING} games) — using cautious defaults.`);
    }

    // Win rate assessment
    if (score.emaWinRate >= 0.6) {
        parts.push(`Strong win rate (${(score.emaWinRate * 100).toFixed(1)}% EMA).`);
    } else if (score.emaWinRate <= 0.4) {
        parts.push(`Weak win rate (${(score.emaWinRate * 100).toFixed(1)}% EMA).`);
    } else {
        parts.push(`Neutral win rate (${(score.emaWinRate * 100).toFixed(1)}% EMA).`);
    }

    // Momentum
    if (Math.abs(score.momentum) > 0.3) {
        parts.push(
            score.momentum > 0
                ? `Upward momentum (+${(score.momentum * 100).toFixed(0)}%).`
                : `Downward momentum (${(score.momentum * 100).toFixed(0)}%).`,
        );
    }

    // Streak
    if (Math.abs(score.streakHeat) > 0.3) {
        parts.push(score.streakHeat > 0 ? "On a hot streak 🔥." : "Cold streak ❄️.");
    }

    // Volatility
    if (score.volatility > 0.6) {
        parts.push("High volatility — results are erratic.");
    }

    // Strategy suggestion
    parts.push(
        `→ Suggesting ${score.suggestedStrategy} strategy (confidence: ${(score.confidence * 100).toFixed(0)}%).`,
    );

    return parts.join(" ");
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Compute a full performance score from the current agent and game state.
 * This is the main entry point — call it every tick.
 */
export function computeScore(
    agentState: AgentState,
    gameState: GameState,
): PerformanceScore {
    const { decisionLog, gamesPlayed, wins } = agentState;

    const rawWinRate = gamesPlayed > 0 ? wins / gamesPlayed : 0.5;
    const emaWinRate = computeEmaWinRate(decisionLog);
    const recentWinRate = computeRecentWinRate(decisionLog, RECENT_WINDOW);
    const momentum = computeMomentum(decisionLog, RECENT_WINDOW);
    const volatility = computeVolatility(
        decisionLog,
        RECENT_WINDOW,
        gameState.currentBet,
    );
    const streakHeat = computeStreakHeat(gameState);
    const confidence = computeConfidence(gamesPlayed, volatility, emaWinRate);
    const kellyFraction = computeKellyFraction(emaWinRate);
    const suggested = suggestStrategy(emaWinRate, momentum, streakHeat, confidence);

    const score: PerformanceScore = {
        emaWinRate,
        rawWinRate,
        recentWinRate,
        momentum,
        volatility,
        confidence,
        streakHeat,
        kellyFraction,
        suggestedStrategy: suggested,
        explanation: "", // filled below
    };

    score.explanation = buildExplanation(score, gamesPlayed);
    return score;
}

/**
 * Compute a recommended bet size based on the Kelly fraction
 * and the agent's current balance.
 *
 * @param balance      Agent's current balance
 * @param kelly        Kelly fraction from computeScore()
 * @param minBet       Minimum allowed bet
 * @param maxBet       Maximum allowed bet
 */
export function computeBetSize(
    balance: number,
    kelly: number,
    minBet: number,
    maxBet: number,
): number {
    const raw = balance * kelly;
    return Math.max(minBet, Math.min(raw, maxBet));
}

/**
 * CKB Arcade — Adaptive Strategy & Scoring Tests
 *
 * Tests the AI-like decision system:
 *   1. Scoring engine (EMA, momentum, volatility, streaks, Kelly)
 *   2. Strategy auto-switching
 *   3. Tilt detection
 *   4. Adaptive thresholds
 *   5. Bet sizing
 */

import { Agent } from "../agent.js";
import { computeScore, computeBetSize, type PerformanceScore } from "../scoring.js";
import {
    evaluate,
    getPerformanceScore,
    getEffectiveStrategy,
    explainDecision,
} from "../strategy.js";
import type { AgentConfig, AgentState, GameState, DecisionLogEntry } from "../types.js";
import { resolve } from "node:path";
import { unlink } from "node:fs/promises";
import { existsSync } from "node:fs";

const TEST_MEMORY = resolve(
    import.meta.dirname ?? ".",
    "..",
    "..",
    "data",
    "test_adaptive.json",
);

// ── Helpers ──────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.error(`  ❌ ${label}`);
        failed++;
    }
}

async function cleanup() {
    if (existsSync(TEST_MEMORY)) await unlink(TEST_MEMORY);
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
    return {
        gameId: "coin-flip",
        currentBet: 10,
        lastResult: 0,
        winStreak: 0,
        lossStreak: 0,
        ...overrides,
    };
}

function makeLogEntry(won: boolean, bet = 10): DecisionLogEntry {
    const delta = won ? bet : -bet;
    return {
        timestamp: new Date().toISOString(),
        gameState: makeGameState({ lastResult: delta }),
        action: "PLAY",
        balanceBefore: 1000,
        balanceAfter: 1000 + delta,
    };
}

function makeAgentState(overrides: Partial<AgentState> = {}): AgentState {
    return {
        config: {
            id: "test",
            initialBalance: 1000,
            strategy: "conservative",
            profitTarget: 0.2,
            stopLoss: 0.15,
        },
        balance: 1000,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        lastUpdated: new Date().toISOString(),
        halted: false,
        decisionLog: [],
        ...overrides,
    };
}

// ── Scoring Tests ────────────────────────────────────────────────

async function testEmaWinRate() {
    console.log("\n🔸 Test: EMA win rate responds to recent results");

    // All wins
    const allWins = makeAgentState({
        gamesPlayed: 10,
        wins: 10,
        losses: 0,
        decisionLog: Array.from({ length: 10 }, () => makeLogEntry(true)),
    });
    const s1 = computeScore(allWins, makeGameState());
    assert(s1.emaWinRate > 0.8, `All wins → EMA > 80% (got ${(s1.emaWinRate * 100).toFixed(1)}%)`);

    // All losses
    const allLosses = makeAgentState({
        gamesPlayed: 10,
        wins: 0,
        losses: 10,
        decisionLog: Array.from({ length: 10 }, () => makeLogEntry(false)),
    });
    const s2 = computeScore(allLosses, makeGameState());
    assert(s2.emaWinRate < 0.2, `All losses → EMA < 20% (got ${(s2.emaWinRate * 100).toFixed(1)}%)`);

    // Mixed: 5 losses then 5 wins → EMA should be high (recency bias)
    const mixedRecovery = makeAgentState({
        gamesPlayed: 10,
        wins: 5,
        losses: 5,
        decisionLog: [
            ...Array.from({ length: 5 }, () => makeLogEntry(false)),
            ...Array.from({ length: 5 }, () => makeLogEntry(true)),
        ],
    });
    const s3 = computeScore(mixedRecovery, makeGameState());
    assert(
        s3.emaWinRate > s3.rawWinRate,
        `Recovery → EMA (${(s3.emaWinRate * 100).toFixed(1)}%) > raw (${(s3.rawWinRate * 100).toFixed(1)}%) due to recency`,
    );
}

async function testMomentum() {
    console.log("\n🔸 Test: Momentum detects trends");

    // Upward trend: losses then wins
    const upward = makeAgentState({
        gamesPlayed: 10,
        wins: 5,
        losses: 5,
        decisionLog: [
            ...Array.from({ length: 5 }, () => makeLogEntry(false)),
            ...Array.from({ length: 5 }, () => makeLogEntry(true)),
        ],
    });
    const s1 = computeScore(upward, makeGameState());
    assert(s1.momentum > 0, `Upward trend → positive momentum (${(s1.momentum * 100).toFixed(0)}%)`);

    // Downward trend: wins then losses
    const downward = makeAgentState({
        gamesPlayed: 10,
        wins: 5,
        losses: 5,
        decisionLog: [
            ...Array.from({ length: 5 }, () => makeLogEntry(true)),
            ...Array.from({ length: 5 }, () => makeLogEntry(false)),
        ],
    });
    const s2 = computeScore(downward, makeGameState());
    assert(s2.momentum < 0, `Downward trend → negative momentum (${(s2.momentum * 100).toFixed(0)}%)`);
}

async function testStreakHeat() {
    console.log("\n🔸 Test: Streak heat detection");

    const state = makeAgentState({ gamesPlayed: 10 });

    const hot = computeScore(state, makeGameState({ winStreak: 5 }));
    assert(hot.streakHeat > 0.5, `5-win streak → hot (${hot.streakHeat.toFixed(2)})`);

    const cold = computeScore(state, makeGameState({ lossStreak: 5 }));
    assert(cold.streakHeat < -0.5, `5-loss streak → cold (${cold.streakHeat.toFixed(2)})`);

    const neutral = computeScore(state, makeGameState());
    assert(neutral.streakHeat === 0, `No streak → neutral (${neutral.streakHeat})`);
}

async function testVolatility() {
    console.log("\n🔸 Test: Volatility scoring");

    // Consistent results (all same outcome) → low volatility
    const consistent = makeAgentState({
        gamesPlayed: 10,
        wins: 10,
        decisionLog: Array.from({ length: 10 }, () => makeLogEntry(true)),
    });
    const s1 = computeScore(consistent, makeGameState());
    assert(s1.volatility < 0.3, `All wins → low volatility (${s1.volatility.toFixed(2)})`);

    // Alternating win/loss → higher volatility
    const alternating = makeAgentState({
        gamesPlayed: 10,
        wins: 5,
        losses: 5,
        decisionLog: Array.from({ length: 10 }, (_, i) => makeLogEntry(i % 2 === 0)),
    });
    const s2 = computeScore(alternating, makeGameState());
    assert(
        s2.volatility > s1.volatility,
        `Alternating → higher volatility (${s2.volatility.toFixed(2)}) than consistent (${s1.volatility.toFixed(2)})`,
    );
}

async function testKellyFraction() {
    console.log("\n🔸 Test: Kelly criterion bet sizing");

    // High win rate → positive Kelly
    const winner = makeAgentState({
        gamesPlayed: 20,
        wins: 15,
        losses: 5,
        decisionLog: [
            ...Array.from({ length: 5 }, () => makeLogEntry(false)),
            ...Array.from({ length: 15 }, () => makeLogEntry(true)),
        ],
    });
    const s1 = computeScore(winner, makeGameState());
    assert(s1.kellyFraction > 0, `High win-rate → positive Kelly (${s1.kellyFraction.toFixed(3)})`);

    // Low win rate → zero Kelly (don't bet)
    // Log order matters: recent results are last, so put wins first then losses
    // so EMA skews toward recent losses → low Kelly
    const loser = makeAgentState({
        gamesPlayed: 20,
        wins: 5,
        losses: 15,
        decisionLog: [
            ...Array.from({ length: 5 }, () => makeLogEntry(true)),
            ...Array.from({ length: 15 }, () => makeLogEntry(false)),
        ],
    });
    const s2 = computeScore(loser, makeGameState());
    assert(s2.kellyFraction === 0, `Low win-rate → zero Kelly (${s2.kellyFraction.toFixed(3)})`);

    // Bet size computation
    const betSize = computeBetSize(1000, s1.kellyFraction, 10, 200);
    assert(betSize >= 10, `Bet size ≥ minBet (got ${betSize.toFixed(2)})`);
    assert(betSize <= 200, `Bet size ≤ maxBet (got ${betSize.toFixed(2)})`);
}

async function testConfidence() {
    console.log("\n🔸 Test: Confidence grows with experience");

    // Few games → low confidence
    const early = makeAgentState({
        gamesPlayed: 2,
        decisionLog: [makeLogEntry(true), makeLogEntry(true)],
    });
    const s1 = computeScore(early, makeGameState());

    // Many games → higher confidence
    const experienced = makeAgentState({
        gamesPlayed: 30,
        wins: 20,
        losses: 10,
        decisionLog: Array.from({ length: 30 }, (_, i) => makeLogEntry(i % 3 !== 0)),
    });
    const s2 = computeScore(experienced, makeGameState());

    assert(
        s2.confidence > s1.confidence,
        `30 games (${s2.confidence.toFixed(2)}) > 2 games (${s1.confidence.toFixed(2)}) confidence`,
    );
}

// ── Strategy Adaptation Tests ────────────────────────────────────

async function testStrategySwitching() {
    console.log("\n🔸 Test: Auto strategy switching");

    // Hot streak + high win rate → should suggest aggressive
    const hotState = makeAgentState({
        gamesPlayed: 15,
        wins: 12,
        losses: 3,
        decisionLog: [
            ...Array.from({ length: 3 }, () => makeLogEntry(false)),
            ...Array.from({ length: 12 }, () => makeLogEntry(true)),
        ],
    });
    const hotScore = computeScore(hotState, makeGameState({ winStreak: 4 }));
    assert(
        hotScore.suggestedStrategy === "aggressive",
        `Hot streak + high win rate → aggressive (got ${hotScore.suggestedStrategy})`,
    );

    // Cold streak + low win rate → should suggest conservative
    const coldState = makeAgentState({
        gamesPlayed: 15,
        wins: 4,
        losses: 11,
        decisionLog: [
            ...Array.from({ length: 4 }, () => makeLogEntry(true)),
            ...Array.from({ length: 11 }, () => makeLogEntry(false)),
        ],
    });
    const coldScore = computeScore(coldState, makeGameState({ lossStreak: 5 }));
    assert(
        coldScore.suggestedStrategy === "conservative",
        `Cold streak + low win rate → conservative (got ${coldScore.suggestedStrategy})`,
    );
}

async function testEffectiveStrategyEarlyPhase() {
    console.log("\n🔸 Test: Early phase uses config strategy");

    const earlyState = makeAgentState({
        config: {
            id: "test",
            initialBalance: 1000,
            strategy: "conservative",
            profitTarget: 0.2,
            stopLoss: 0.15,
        },
        gamesPlayed: 3,
    });

    const effective = getEffectiveStrategy(earlyState, makeGameState());
    assert(
        effective === "conservative",
        `<5 games → uses config strategy (got ${effective})`,
    );
}

async function testTiltDetection() {
    console.log("\n🔸 Test: Tilt detection triggers WAIT");
    await cleanup();

    const agent = await Agent.create(
        {
            id: "tilt-test",
            initialBalance: 1000,
            strategy: "aggressive",
            profitTarget: 0.5,
            stopLoss: 0.5,
        },
        TEST_MEMORY,
    );

    // Simulate 8 games with erratic pattern (high volatility + losses)
    // Alternating big wins and losses, trending downward
    const pattern = [
        { lastResult: 20, winStreak: 1, lossStreak: 0 },
        { lastResult: -30, winStreak: 0, lossStreak: 1 },
        { lastResult: 15, winStreak: 1, lossStreak: 0 },
        { lastResult: -35, winStreak: 0, lossStreak: 1 },
        { lastResult: 10, winStreak: 1, lossStreak: 0 },
        { lastResult: -40, winStreak: 0, lossStreak: 1 },
        { lastResult: -25, winStreak: 0, lossStreak: 2 },
        { lastResult: -30, winStreak: 0, lossStreak: 3 },
    ];

    let lastAction = "PLAY";
    for (const gs of pattern) {
        lastAction = await agent.decideNextAction(makeGameState(gs));
        if (lastAction === "STOP") break;
    }

    // Should have triggered WAIT at some point due to tilt or loss streak
    // The agent either hit tilt or loss-streak cooldown
    assert(
        lastAction === "WAIT" || lastAction === "STOP",
        `Erratic pattern → WAIT or STOP (got ${lastAction})`,
    );
    await cleanup();
}

async function testAdaptiveDecisionAfterWins() {
    console.log("\n🔸 Test: Decisions adapt after winning streak");
    await cleanup();

    const agent = await Agent.create(
        {
            id: "adapt-win",
            initialBalance: 1000,
            strategy: "conservative",
            profitTarget: 0.5,
            stopLoss: 0.3,
        },
        TEST_MEMORY,
    );

    // Feed 3 losses then 6 wins — creates a visible upward momentum
    // (losses first so momentum linear regression slopes upward)
    for (let i = 0; i < 3; i++) {
        await agent.decideNextAction(
            makeGameState({ lastResult: -10, winStreak: 0, lossStreak: i + 1 }),
        );
    }
    for (let i = 0; i < 6; i++) {
        await agent.decideNextAction(
            makeGameState({ lastResult: 20, winStreak: i + 1, lossStreak: 0 }),
        );
    }

    // After winning streak, the score should show it
    const score = getPerformanceScore(agent.snapshot, makeGameState({ winStreak: 6 }));
    assert(
        score.emaWinRate > 0.7,
        `After 6 wins → EMA > 70% (got ${(score.emaWinRate * 100).toFixed(1)}%)`,
    );
    assert(
        score.streakHeat > 0,
        `After 6 wins → hot streak (heat: ${score.streakHeat.toFixed(2)})`,
    );
    assert(
        score.momentum > 0,
        `After losses then wins → positive momentum (${(score.momentum * 100).toFixed(0)}%)`,
    );
    await cleanup();
}

async function testExplainDecisionEnhanced() {
    console.log("\n🔸 Test: Enhanced explanations include scoring insights");

    const state = makeAgentState({
        gamesPlayed: 10,
        wins: 7,
        losses: 3,
        decisionLog: Array.from({ length: 10 }, (_, i) => makeLogEntry(i % 10 < 7)),
    });

    const explanation = explainDecision(state, makeGameState(), "PLAY");
    assert(explanation.includes("EMA win-rate"), `Explanation includes EMA win-rate`);
    assert(explanation.includes("momentum"), `Explanation includes momentum`);
}

async function testScoringExplanation() {
    console.log("\n🔸 Test: Scoring generates readable explanation");

    const state = makeAgentState({
        gamesPlayed: 15,
        wins: 12,
        losses: 3,
        decisionLog: [
            ...Array.from({ length: 3 }, () => makeLogEntry(false)),
            ...Array.from({ length: 12 }, () => makeLogEntry(true)),
        ],
    });
    const score = computeScore(state, makeGameState({ winStreak: 3 }));

    assert(score.explanation.length > 20, "Explanation is non-trivial");
    assert(score.explanation.includes("EMA"), "Explanation mentions EMA");
    assert(
        score.explanation.includes("aggressive") || score.explanation.includes("conservative"),
        "Explanation includes strategy suggestion",
    );
}

// ── Runner ───────────────────────────────────────────────────────

async function main() {
    console.log("═══════════════════════════════════════════");
    console.log("  CKB Arcade — Adaptive Strategy Tests");
    console.log("═══════════════════════════════════════════");

    // Scoring tests
    await testEmaWinRate();
    await testMomentum();
    await testStreakHeat();
    await testVolatility();
    await testKellyFraction();
    await testConfidence();

    // Strategy adaptation tests
    await testStrategySwitching();
    await testEffectiveStrategyEarlyPhase();
    await testTiltDetection();
    await testAdaptiveDecisionAfterWins();
    await testExplainDecisionEnhanced();
    await testScoringExplanation();

    console.log("\n───────────────────────────────────────────");
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log("───────────────────────────────────────────\n");

    if (failed > 0) process.exit(1);
}

main().catch((err) => {
    console.error("Test suite crashed:", err);
    process.exit(1);
});

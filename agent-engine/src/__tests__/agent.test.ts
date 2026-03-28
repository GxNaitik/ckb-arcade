/**
 * CKB Arcade — Agent Engine Smoke Tests
 *
 * Lightweight test harness that runs with `tsx` (no test framework
 * required). Validates core agent behaviour:
 *   1. Stop on stop-loss breach.
 *   2. Stop on profit-target reached.
 *   3. WAIT on loss-streak cooldown.
 *   4. Persistence round-trip (create → resume).
 */

import { Agent } from "../agent.js";
import type { AgentConfig, GameState } from "../types.js";
import { resolve } from "node:path";
import { unlink } from "node:fs/promises";
import { existsSync } from "node:fs";

const TEST_MEMORY = resolve(import.meta.dirname ?? ".", "..", "..", "data", "test_memory.json");

// ── Helpers ──────────────────────────────────────────────────────

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

const defaultConfig: AgentConfig = {
    id: "test-agent",
    initialBalance: 1000,
    strategy: "conservative",
    profitTarget: 0.2,  // 20 %
    stopLoss: 0.15,     // 15 %
};

async function cleanup() {
    if (existsSync(TEST_MEMORY)) await unlink(TEST_MEMORY);
}

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

// ── Tests ────────────────────────────────────────────────────────

async function testStopLoss() {
    console.log("\n🔸 Test: Stop on stop-loss breach");
    await cleanup();
    const agent = await Agent.create(defaultConfig, TEST_MEMORY);

    // Simulate a large loss (> 15 % of 1000 = 150 CKB)
    const action = await agent.decideNextAction(
        makeGameState({ lastResult: -200 }),
    );
    assert(action === "STOP", `Action should be STOP (got ${action})`);
    assert(agent.isHalted === true, "Agent should be halted");
    await cleanup();
}

async function testProfitTarget() {
    console.log("\n🔸 Test: Stop on profit target reached");
    await cleanup();
    const agent = await Agent.create(defaultConfig, TEST_MEMORY);

    // Simulate a large win (> 20 % of 1000 = 200 CKB)
    const action = await agent.decideNextAction(
        makeGameState({ lastResult: 250 }),
    );
    assert(action === "STOP", `Action should be STOP (got ${action})`);
    assert(agent.isHalted === true, "Agent should be halted");
    await cleanup();
}

async function testLossStreakCooldown() {
    console.log("\n🔸 Test: WAIT on loss-streak cooldown (conservative)");
    await cleanup();
    const agent = await Agent.create(defaultConfig, TEST_MEMORY);

    // Conservative maxLossStreak = 2. Simulate 2 consecutive losses
    // that don't breach stop-loss individually.
    await agent.decideNextAction(makeGameState({ lastResult: -30, lossStreak: 1 }));
    const action = await agent.decideNextAction(
        makeGameState({ lastResult: -30, lossStreak: 2 }),
    );
    assert(action === "WAIT", `Action should be WAIT (got ${action})`);
    assert(agent.isHalted === false, "Agent should NOT be halted on WAIT");
    await cleanup();
}

async function testContinuePlaying() {
    console.log("\n🔸 Test: Keep playing within bounds");
    await cleanup();
    const agent = await Agent.create(defaultConfig, TEST_MEMORY);

    const action = await agent.decideNextAction(
        makeGameState({ lastResult: 10, winStreak: 1 }),
    );
    assert(action === "PLAY", `Action should be PLAY (got ${action})`);
    await cleanup();
}

async function testPersistenceRoundTrip() {
    console.log("\n🔸 Test: Persistence round-trip (create → resume)");
    await cleanup();
    const agent = await Agent.create(defaultConfig, TEST_MEMORY);

    await agent.decideNextAction(makeGameState({ lastResult: 50, winStreak: 1 }));

    const resumed = await Agent.resume(TEST_MEMORY);
    assert(resumed.balance === agent.balance, `Balance matches after resume (${resumed.balance})`);
    assert(resumed.gamesPlayed === 1, `Games played = 1 after resume`);
    await cleanup();
}

async function testSummary() {
    console.log("\n🔸 Test: P&L summary");
    await cleanup();
    const agent = await Agent.create(defaultConfig, TEST_MEMORY);

    await agent.decideNextAction(makeGameState({ lastResult: 100, winStreak: 1 }));
    const summary = agent.getSummary();
    assert(summary.netResult === 100, `Net result = 100 (got ${summary.netResult})`);
    assert(summary.profitPercent === 10, `Profit = 10% (got ${summary.profitPercent})`);
    assert(summary.winRate === 100, `Win rate = 100% (got ${summary.winRate})`);
    await cleanup();
}

// ── Runner ───────────────────────────────────────────────────────

async function main() {
    console.log("═══════════════════════════════════════════");
    console.log("  CKB Arcade — Agent Engine Tests");
    console.log("═══════════════════════════════════════════");

    await testStopLoss();
    await testProfitTarget();
    await testLossStreakCooldown();
    await testContinuePlaying();
    await testPersistenceRoundTrip();
    await testSummary();

    console.log("\n───────────────────────────────────────────");
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log("───────────────────────────────────────────\n");

    if (failed > 0) process.exit(1);
}

main().catch((err) => {
    console.error("Test suite crashed:", err);
    process.exit(1);
});

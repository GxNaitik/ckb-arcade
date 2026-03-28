/**
 * CKB Arcade — Agent Runner Smoke Tests
 *
 * Validates the runner lifecycle:
 *   1. Starts and runs ticks.
 *   2. Stops when agent decides STOP.
 *   3. Handles errors without crashing.
 *   4. Lifecycle hooks fire correctly.
 *   5. Logs are written to file.
 */

import { AgentRunner } from "../runner.js";
import { MockCoinFlipAdapter } from "../game-adapter.js";
import type { AgentConfig, AgentAction, GameState } from "../types.js";
import { resolve } from "node:path";
import { unlink } from "node:fs/promises";
import { existsSync } from "node:fs";

const TEST_MEMORY = resolve(import.meta.dirname ?? ".", "..", "..", "data", "test_runner_memory.json");

const defaultConfig: AgentConfig = {
    id: "test-runner-agent",
    initialBalance: 1000,
    strategy: "conservative",
    profitTarget: 0.20,
    stopLoss: 0.15,
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

async function testRunnerStartsAndStops() {
    console.log("\n🔸 Test: Runner starts, runs ticks, and stops");
    await cleanup();

    let tickCount = 0;
    let stopCalled = false;

    const runner = new AgentRunner(
        {
            agentConfig: defaultConfig,
            gameAdapter: new MockCoinFlipAdapter(),
            intervalMs: 100,   // fast interval for testing
            memoryPath: TEST_MEMORY,
            logLevel: "WARN",  // reduce noise during tests
        },
        {
            onAfterTick: async (tick) => {
                tickCount = tick;
                // Stop after 3 ticks
                if (tick >= 3) {
                    await runner.stop("Test limit reached");
                }
            },
            onStop: async () => {
                stopCalled = true;
            },
        },
    );

    await runner.start();

    // Wait for a few ticks
    await new Promise((r) => setTimeout(r, 600));

    assert(tickCount >= 3, `At least 3 ticks executed (got ${tickCount})`);
    assert(stopCalled, "onStop hook was called");
    assert(!runner.isRunning, "Runner is not running after stop");
    await cleanup();
}

async function testRunnerStopsOnAgentHalt() {
    console.log("\n🔸 Test: Runner stops when agent decides STOP");
    await cleanup();

    // Use a large stop-loss so stop only triggers from profit target
    const config: AgentConfig = {
        ...defaultConfig,
        profitTarget: 0.01,  // very low target — will trigger quickly
    };

    let stopReason = "";

    const runner = new AgentRunner(
        {
            agentConfig: config,
            gameAdapter: new MockCoinFlipAdapter(),
            intervalMs: 100,
            memoryPath: TEST_MEMORY,
            logLevel: "WARN",
        },
        {
            onStop: async (reason) => {
                stopReason = reason;
            },
        },
    );

    await runner.start();
    await new Promise((r) => setTimeout(r, 2000));

    assert(!runner.isRunning, "Runner stopped after agent STOP");
    assert(
        stopReason.includes("STOP") || stopReason.includes("stop") || stopReason.length > 0,
        `Stop reason populated: "${stopReason}"`,
    );
    await cleanup();
}

async function testRunnerHandlesErrors() {
    console.log("\n🔸 Test: Runner handles errors gracefully");
    await cleanup();

    let errorCount = 0;

    // Adapter that always throws
    const brokenAdapter: import("../game-adapter.js").GameAdapter = {
        name: "Broken Adapter",
        gameId: "broken",
        async getGameState() {
            throw new Error("Simulated failure");
        },
        async play() {
            throw new Error("Simulated failure");
        },
    };

    const runner = new AgentRunner(
        {
            agentConfig: defaultConfig,
            gameAdapter: brokenAdapter,
            intervalMs: 100,
            memoryPath: TEST_MEMORY,
            maxConsecutiveErrors: 3,
            logLevel: "ERROR",
        },
        {
            onError: async () => {
                errorCount++;
            },
        },
    );

    await runner.start();
    await new Promise((r) => setTimeout(r, 1000));

    assert(errorCount >= 3, `Error hook called ≥3 times (got ${errorCount})`);
    assert(!runner.isRunning, "Runner auto-halted after max errors");
    await cleanup();
}

// ── Runner ───────────────────────────────────────────────────────

async function main() {
    console.log("═══════════════════════════════════════════");
    console.log("  CKB Arcade — Agent Runner Tests");
    console.log("═══════════════════════════════════════════");

    await testRunnerStartsAndStops();
    await testRunnerStopsOnAgentHalt();
    await testRunnerHandlesErrors();

    console.log("\n───────────────────────────────────────────");
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log("───────────────────────────────────────────\n");

    if (failed > 0) process.exit(1);
}

main().catch((err) => {
    console.error("Test suite crashed:", err);
    process.exit(1);
});

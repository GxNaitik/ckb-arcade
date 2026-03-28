/**
 * CKB Arcade — Agent Runner CLI Entry Point
 *
 * Run with:  npx tsx src/run.ts
 *
 * Starts the agent loop with a mock coin-flip adapter for demo /
 * testing. Replace MockCoinFlipAdapter with a real game adapter
 * to run against live games.
 *
 * Graceful shutdown on SIGINT (Ctrl+C) and SIGTERM.
 */

import { AgentRunner } from "./runner.js";
import { MockCoinFlipAdapter } from "./game-adapter.js";
import type { AgentConfig } from "./types.js";

// ─── Configuration ───────────────────────────────────────────────

const agentConfig: AgentConfig = {
    id: "ckb-arcade-agent-001",
    initialBalance: 1000,
    strategy: "conservative",
    profitTarget: 0.20,   // stop at +20 %
    stopLoss: 0.15,        // stop at -15 %
};

const runner = new AgentRunner(
    {
        agentConfig,
        gameAdapter: new MockCoinFlipAdapter(),
        intervalMs: 10_000,          // 10 seconds
        maxConsecutiveErrors: 10,
        logLevel: "INFO",
    },
    {
        // ── Optional lifecycle hooks ──────────────────────────────
        onPlay: async (gameState) => {
            // Example: you could trigger a webhook, update a UI, etc.
            // console.log("  [hook] Round played:", gameState);
        },
        onStop: async (reason) => {
            console.log(`\n🛑 Agent stopped: ${reason}\n`);
        },
        onError: async (error, tick) => {
            // Example: send error to monitoring service
            // await alertService.send(error, tick);
        },
    },
);

// ─── Graceful Shutdown ───────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
    console.log(`\n⚡ Received ${signal} — shutting down gracefully…`);
    await runner.stop(`${signal} received`);
    process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ─── Start ───────────────────────────────────────────────────────

console.log(`
╔═══════════════════════════════════════════╗
║     CKB Arcade — Agent Runner (Demo)      ║
╠═══════════════════════════════════════════╣
║  Strategy:     ${agentConfig.strategy.padEnd(26)}║
║  Balance:      ${String(agentConfig.initialBalance + " CKB").padEnd(26)}║
║  Profit target: ${(agentConfig.profitTarget * 100 + " %").padEnd(25)}║
║  Stop loss:    ${(agentConfig.stopLoss * 100 + " %").padEnd(26)}║
║  Interval:     10s                        ║
╚═══════════════════════════════════════════╝
`);

runner.start().catch((err) => {
    console.error("Fatal: Runner failed to start", err);
    process.exit(1);
});

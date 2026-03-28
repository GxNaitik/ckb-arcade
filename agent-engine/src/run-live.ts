/**
 * CKB Arcade — Live Agent Runner
 *
 * Run with:  npx tsx src/run-live.ts
 *
 * Starts the agent loop with the REAL CoinFlipAdapter, sending
 * actual CKB transactions on the testnet. Requires a funded agent
 * wallet and a running backend.
 *
 * Configuration via .env file (see .env.example).
 */

import "dotenv/config";
import { AgentRunner } from "./runner.js";
import { CoinFlipAdapter } from "./coin-flip-adapter.js";
import { AgentWallet } from "./wallet.js";
import type { AgentConfig, Strategy } from "./types.js";

// ─── Validate Environment ────────────────────────────────────────

function requireEnv(key: string): string {
    const val = process.env[key];
    if (!val) {
        console.error(`❌ Missing required env variable: ${key}`);
        console.error(`   Copy .env.example to .env and fill in your values.`);
        process.exit(1);
    }
    return val;
}

const AGENT_PRIVATE_KEY = requireEnv("AGENT_PRIVATE_KEY");
const GAME_ADDRESS = requireEnv("GAME_ADDRESS");
const API_BASE = process.env.API_BASE ?? "http://localhost:8787";
const CKB_RPC_URL = process.env.CKB_RPC_URL;
const PAYOUT_API_KEY = process.env.PAYOUT_API_KEY;

const strategy = (process.env.AGENT_STRATEGY ?? "conservative") as Strategy;
const betAmount = Number(process.env.BET_AMOUNT ?? 100);
const initialBalance = Number(process.env.INITIAL_BALANCE ?? 1000);
const profitTarget = Number(process.env.PROFIT_TARGET ?? 0.20);
const stopLoss = Number(process.env.STOP_LOSS ?? 0.15);
const intervalMs = Number(process.env.INTERVAL_MS ?? 10_000);

// ─── Setup ───────────────────────────────────────────────────────

const wallet = new AgentWallet({
    privateKey: AGENT_PRIVATE_KEY,
    rpcUrl: CKB_RPC_URL,
    feeRate: 2000,
});

const adapter = new CoinFlipAdapter({
    wallet,
    gameAddress: GAME_ADDRESS,
    apiBase: API_BASE,
    betAmount,
    payoutApiKey: PAYOUT_API_KEY,
});

const agentConfig: AgentConfig = {
    id: "ckb-arcade-live-agent",
    initialBalance,
    strategy,
    profitTarget,
    stopLoss,
};

const runner = new AgentRunner(
    {
        agentConfig,
        gameAdapter: adapter,
        intervalMs,
        maxConsecutiveErrors: 5,
        logLevel: "INFO",
    },
    {
        onStop: async (reason) => {
            console.log(`\n🛑 Agent stopped: ${reason}\n`);
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
║   CKB Arcade — Live Agent Runner          ║
╠═══════════════════════════════════════════╣
║  Mode:         LIVE (real transactions)   ║
║  Strategy:     ${strategy.padEnd(26)}║
║  Bet amount:   ${String(betAmount + " CKB").padEnd(26)}║
║  Profit target: ${(profitTarget * 100 + " %").padEnd(25)}║
║  Stop loss:    ${(stopLoss * 100 + " %").padEnd(26)}║
║  Interval:     ${(intervalMs / 1000 + "s").padEnd(26)}║
║  Backend:      ${API_BASE.padEnd(26)}║
╚═══════════════════════════════════════════╝
`);

runner.start().catch((err) => {
    console.error("Fatal: Runner failed to start", err);
    process.exit(1);
});

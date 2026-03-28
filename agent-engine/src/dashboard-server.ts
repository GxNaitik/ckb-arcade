/**
 * CKB Arcade — Agent Dashboard Server
 *
 * Lightweight HTTP server (no Express needed) that:
 *   1. Serves the dashboard HTML at /
 *   2. Exposes agent state via REST API at /api/agent
 *   3. Auto-refreshes from the persisted memory.json
 *
 * Run:  npx tsx src/dashboard-server.ts
 * Then: open http://localhost:3210
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentState } from "./types.js";
import { computeScore, type PerformanceScore } from "./scoring.js";
import { getEffectiveStrategy } from "./strategy.js";

const PORT = Number(process.env.DASHBOARD_PORT ?? 3210);
const MEMORY_PATH = resolve(
    import.meta.dirname ?? ".",
    "..",
    "data",
    "memory.json",
);
const DASHBOARD_PATH = resolve(
    import.meta.dirname ?? ".",
    "..",
    "dashboard",
    "index.html",
);

// ─── API Response Types ──────────────────────────────────────────

interface DashboardData {
    agent: AgentState | null;
    scoring: PerformanceScore | null;
    effectiveStrategy: string;
    summary: {
        profitPercent: number;
        lossPercent: number;
        netResult: number;
        gamesPlayed: number;
        winRate: number;
    } | null;
    timestamp: string;
    status: "running" | "halted" | "no_data";
}

// ─── Load Agent State ────────────────────────────────────────────

async function loadAgentData(): Promise<DashboardData> {
    const ts = new Date().toISOString();

    if (!existsSync(MEMORY_PATH)) {
        return {
            agent: null,
            scoring: null,
            effectiveStrategy: "unknown",
            summary: null,
            timestamp: ts,
            status: "no_data",
        };
    }

    try {
        const raw = await readFile(MEMORY_PATH, "utf-8");
        const agent = JSON.parse(raw) as AgentState;

        const lastGameState = agent.decisionLog.length > 0
            ? agent.decisionLog[agent.decisionLog.length - 1].gameState
            : {
                gameId: "none",
                currentBet: 0,
                lastResult: 0,
                winStreak: 0,
                lossStreak: 0,
            };

        const scoring = computeScore(agent, lastGameState);
        const effectiveStrategy = getEffectiveStrategy(agent, lastGameState);

        const initial = agent.config.initialBalance;
        const net = agent.balance - initial;

        return {
            agent,
            scoring,
            effectiveStrategy,
            summary: {
                profitPercent: net > 0 ? (net / initial) * 100 : 0,
                lossPercent: net < 0 ? (Math.abs(net) / initial) * 100 : 0,
                netResult: net,
                gamesPlayed: agent.gamesPlayed,
                winRate: agent.gamesPlayed > 0
                    ? (agent.wins / agent.gamesPlayed) * 100
                    : 0,
            },
            timestamp: ts,
            status: agent.halted ? "halted" : "running",
        };
    } catch {
        return {
            agent: null,
            scoring: null,
            effectiveStrategy: "unknown",
            summary: null,
            timestamp: ts,
            status: "no_data",
        };
    }
}

// ─── HTTP Server ─────────────────────────────────────────────────

function setCorsHeaders(res: ServerResponse): void {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = req.url ?? "/";

    // API endpoint
    if (url === "/api/agent") {
        const data = await loadAgentData();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
        return;
    }

    // Dashboard HTML
    if (url === "/" || url === "/index.html") {
        if (!existsSync(DASHBOARD_PATH)) {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Dashboard HTML not found at " + DASHBOARD_PATH);
            return;
        }
        const html = await readFile(DASHBOARD_PATH, "utf-8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
    }

    // 404
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
});

server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════╗
║   CKB Arcade — Agent Dashboard            ║
╠═══════════════════════════════════════════╣
║  Dashboard:  http://localhost:${PORT}         ║
║  API:        http://localhost:${PORT}/api/agent║
║  Memory:     ${MEMORY_PATH.slice(-30).padEnd(28)}║
╚═══════════════════════════════════════════╝
  `);
});

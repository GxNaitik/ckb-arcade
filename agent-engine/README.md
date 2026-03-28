# CKB Arcade — Agent Engine

Autonomous agent engine for CKB Arcade. Manages strategy, risk, and game
decisions using a modular, AI-ready architecture.

## Quick Start

```bash
# Install dependencies
npm install

# Run the agent loop (demo with mock coin flip)
npm run run:agent

# Run all tests
npm test

# Build to dist/
npm run build
```

## Architecture

```
agent-engine/
├── src/
│   ├── types.ts          # All type definitions (single source of truth)
│   ├── strategy.ts       # Pure-function decision logic (AI swap-point)
│   ├── persistence.ts    # JSON file storage (swappable backend)
│   ├── logger.ts         # Dual-output logger (console + file)
│   ├── game-adapter.ts   # GameAdapter interface + MockCoinFlipAdapter
│   ├── agent.ts          # Agent class — orchestrator
│   ├── runner.ts         # AgentRunner — interval loop with error handling
│   ├── run.ts            # CLI entry point
│   ├── index.ts          # Barrel export
│   └── __tests__/
│       ├── agent.test.ts  # Agent unit tests (12 tests)
│       └── runner.test.ts # Runner integration tests (7 tests)
├── data/
│   ├── memory.json       # Agent state (auto-generated, gitignored)
│   └── logs/             # Daily log files (auto-generated, gitignored)
├── package.json
└── tsconfig.json
```

## Agent Runner

The `AgentRunner` runs a continuous interval loop (default: every 10s):

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│ GameAdapter  │────▸│    Agent     │────▸│   Runner     │
│ .getState()  │     │ .decideNext  │     │  routes the  │
│ .play()      │◂────│  Action()    │     │   action     │
└─────────────┘     └──────────────┘     └──────┬───────┘
                                                │
                         ┌──────────────────────┼──────────────┐
                         │                      │              │
                      PLAY               WAIT             STOP
                   call .play()      log & wait       halt runner
```

### CLI Usage

```bash
# Start with defaults (mock coin flip, 10s interval)
npm run run:agent

# Stops gracefully with Ctrl+C
```

### Programmatic Usage

```typescript
import { AgentRunner, MockCoinFlipAdapter } from "./src/index.js";

const runner = new AgentRunner(
  {
    agentConfig: {
      id: "my-agent",
      initialBalance: 1000,
      strategy: "conservative",
      profitTarget: 0.20,
      stopLoss: 0.15,
    },
    gameAdapter: new MockCoinFlipAdapter(),
    intervalMs: 10_000,
    maxConsecutiveErrors: 10,
    logLevel: "INFO",
  },
  {
    onPlay:  async (gs) => { /* round completed */ },
    onStop:  async (reason) => { /* runner halted */ },
    onError: async (err, tick) => { /* error occurred */ },
    onBeforeTick: async (tick) => { /* return false to skip */ },
    onAfterTick:  async (tick, action, gs) => { /* post-tick */ },
  },
);

await runner.start();
// ...later:
await runner.stop("Maintenance");
```

### Lifecycle Hooks

| Hook            | When                              | Use Case                          |
|-----------------|-----------------------------------|-----------------------------------|
| `onBeforeTick`  | Before each tick                  | Skip ticks, rate-limit            |
| `onAfterTick`   | After each tick                   | Metrics, UI updates               |
| `onPlay`        | After a game round completes      | Webhooks, notifications           |
| `onStop`        | When runner exits (any reason)    | Cleanup, final report             |
| `onError`       | When a tick throws                | Alerting, monitoring              |

## Extending: Add a New Game

Implement the `GameAdapter` interface:

```typescript
import type { GameAdapter } from "./src/game-adapter.js";
import type { GameState } from "./src/types.js";

export class MyGameAdapter implements GameAdapter {
  readonly name = "My Game";
  readonly gameId = "my-game";

  async getGameState(): Promise<GameState> { /* poll state */ }
  async play(): Promise<GameState> { /* execute round */ }
  async initialize?(): Promise<void> { /* setup */ }
  async shutdown?(): Promise<void> { /* teardown */ }
}
```

Then pass it to the runner:

```typescript
const runner = new AgentRunner({
  agentConfig: { ... },
  gameAdapter: new MyGameAdapter(),
});
```

## Logging

All actions are logged to **both** console and file:

- **Console**: Real-time with log levels (DEBUG/INFO/WARN/ERROR)
- **File**: Daily rotating logs at `data/logs/agent-YYYY-MM-DD.log`

```
[2026-03-24T00:02:17.000Z] [INFO ] [runner] Tick #1 → PLAY  |  Balance: 990.00 CKB  |  Games: 1
[2026-03-24T00:02:17.001Z] [INFO ] [runner] Tick #1 — Triggering game: Mock Coin Flip
[2026-03-24T00:02:17.002Z] [INFO ] [runner] Tick #1 — Round result: -10 CKB
```

## Decision Logic

Priority order (highest → lowest):

| # | Check                  | Action | Trigger                                      |
|---|------------------------|--------|----------------------------------------------|
| 1 | Stop-loss breach       | STOP   | Loss ≥ `stopLoss` %                         |
| 2 | Profit target reached  | STOP   | Profit ≥ `profitTarget` %                   |
| 3 | Emergency balance      | STOP   | Balance ≤ emergency floor (strategy-based)   |
| 4 | Loss-streak cooldown   | WAIT   | Consecutive losses ≥ threshold               |
| 5 | Default                | PLAY   | All checks pass                              |

### Strategy Thresholds

| Parameter                | Aggressive | Conservative |
|--------------------------|------------|--------------|
| Max loss streak          | 5          | 2            |
| Emergency balance floor  | 10 %       | 25 %         |
| Cooldown rounds          | 1          | 3            |

## AI Integration Point

The `strategy.ts` → `evaluate()` function is the primary integration point.
To add ML/AI-based decisions:

1. Create a new strategy evaluator (e.g. `ai-strategy.ts`)
2. Implement the same `(AgentState, GameState) → AgentAction` signature
3. Swap it into the agent via config or dependency injection

The rest of the module (persistence, state management, logging, runner) stays untouched.


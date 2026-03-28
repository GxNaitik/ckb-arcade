/**
 * CKB Arcade — Agent Engine Persistence Layer
 *
 * Reads / writes AgentState to a local JSON file (`memory.json`).
 * Isolated from business logic so the storage backend can be
 * swapped later (DB, IPFS, on-chain, etc.) without touching the
 * Agent class.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AgentState } from "./types.js";

/** Default storage path relative to the module root. */
const DEFAULT_MEMORY_PATH = resolve(
    import.meta.dirname ?? ".",
    "..",
    "data",
    "memory.json",
);

// ─── Public API ──────────────────────────────────────────────────

/**
 * Load agent state from disk.
 * Returns `null` if the file does not yet exist.
 */
export async function loadState(
    filePath: string = DEFAULT_MEMORY_PATH,
): Promise<AgentState | null> {
    if (!existsSync(filePath)) return null;

    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as AgentState;
}

/**
 * Persist agent state to disk.
 * Creates intermediate directories if needed.
 */
export async function saveState(
    state: AgentState,
    filePath: string = DEFAULT_MEMORY_PATH,
): Promise<void> {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
    }

    const serialized = JSON.stringify(state, null, 2);
    await writeFile(filePath, serialized, "utf-8");
}

/**
 * Delete persisted state (useful for resetting between sessions).
 */
export async function clearState(
    filePath: string = DEFAULT_MEMORY_PATH,
): Promise<void> {
    if (existsSync(filePath)) {
        const { unlink } = await import("node:fs/promises");
        await unlink(filePath);
    }
}

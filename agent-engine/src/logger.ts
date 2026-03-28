/**
 * CKB Arcade — Agent Logger
 *
 * Dual-output logger: writes to console AND appends to a rotating
 * log file on disk. Supports log levels so noisy debug output can
 * be toggled without code changes.
 *
 * Usage:
 *   const log = new Logger("runner");
 *   log.info("Agent started");
 *   log.error("Something broke", err);
 */

import { appendFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

// ─── Types ───────────────────────────────────────────────────────

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};

export interface LoggerOptions {
    /** Minimum level to output. Default: "INFO". */
    minLevel?: LogLevel;
    /** Absolute path to the log file. */
    logFilePath?: string;
    /** Whether to also print to console. Default: true. */
    console?: boolean;
}

// ─── Default log path ────────────────────────────────────────────

const DEFAULT_LOG_DIR = resolve(
    import.meta.dirname ?? ".",
    "..",
    "data",
    "logs",
);

function defaultLogPath(): string {
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return resolve(DEFAULT_LOG_DIR, `agent-${date}.log`);
}

// ─── Logger Class ────────────────────────────────────────────────

export class Logger {
    private tag: string;
    private minLevel: LogLevel;
    private logFilePath: string;
    private useConsole: boolean;
    private initPromise: Promise<void> | null = null;

    constructor(tag: string, opts: LoggerOptions = {}) {
        this.tag = tag;
        this.minLevel = opts.minLevel ?? "INFO";
        this.logFilePath = opts.logFilePath ?? defaultLogPath();
        this.useConsole = opts.console ?? true;
    }

    // ── Public methods ───────────────────────────────────────────

    debug(message: string, data?: unknown): void {
        this.log("DEBUG", message, data);
    }

    info(message: string, data?: unknown): void {
        this.log("INFO", message, data);
    }

    warn(message: string, data?: unknown): void {
        this.log("WARN", message, data);
    }

    error(message: string, data?: unknown): void {
        this.log("ERROR", message, data);
    }

    // ── Internal ─────────────────────────────────────────────────

    private log(level: LogLevel, message: string, data?: unknown): void {
        if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) return;

        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level.padEnd(5)}] [${this.tag}]`;
        const line = data !== undefined
            ? `${prefix} ${message} ${this.serialize(data)}`
            : `${prefix} ${message}`;

        // Console output
        if (this.useConsole) {
            const consoleFn =
                level === "ERROR" ? console.error
                    : level === "WARN" ? console.warn
                        : console.log;
            consoleFn(line);
        }

        // File output (fire-and-forget, never blocks the loop)
        this.appendToFile(line).catch(() => {
            // Swallow file-write errors — we never want logging to crash
            // the runner. The console output is the fallback.
        });
    }

    private async appendToFile(line: string): Promise<void> {
        // Ensure log directory exists (once).
        if (!this.initPromise) {
            this.initPromise = this.ensureDir();
        }
        await this.initPromise;

        await appendFile(this.logFilePath, line + "\n", "utf-8");
    }

    private async ensureDir(): Promise<void> {
        const dir = dirname(this.logFilePath);
        if (!existsSync(dir)) {
            await mkdir(dir, { recursive: true });
        }
    }

    private serialize(data: unknown): string {
        if (data instanceof Error) {
            return `${data.message}\n${data.stack ?? ""}`;
        }
        try {
            return JSON.stringify(data);
        } catch {
            return String(data);
        }
    }
}

/**
 * CKB Arcade — Wallet Manager
 *
 * Higher-level wallet management layer that wraps AgentWallet with:
 *   - Per-agent key generation or loading from keystore
 *   - Spending constraints (max per game, minimum balance floor)
 *   - Generic sendTransaction(to, amount) with constraint checks
 *   - Local transaction ledger for audit
 *   - Lock script hook for future on-chain enforcement
 *
 * Designed to be used INSTEAD of constructing AgentWallet directly.
 * The managed wallet is still an AgentWallet under the hood, so all
 * existing adapters (CoinFlipAdapter, etc.) remain compatible.
 *
 *   const mgr = await WalletManager.create({ agentId: "agent-001" });
 *   const wallet = mgr.wallet; // pass to adapters as before
 */

import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ccc } from "@ckb-ccc/core";
import { AgentWallet } from "./wallet.js";
import { Logger } from "./logger.js";

// ─── Types ───────────────────────────────────────────────────────

/** Spending constraints enforced before every transaction. */
export interface SpendingConstraints {
    /** Max CKB per single game/transaction. 0 = unlimited. */
    maxSpendPerGame: number;
    /** Stop all transactions if on-chain balance drops below this. */
    minBalanceThreshold: number;
    /** Max total CKB spend across the entire session. 0 = unlimited. */
    maxSessionSpend: number;
}

/** Persisted keystore entry for one agent wallet. */
export interface KeystoreEntry {
    agentId: string;
    /** Encrypted or plaintext hex private key (0x-prefixed). */
    privateKey: string;
    address: string;
    createdAt: string;
}

/** Record of a single outgoing transaction. */
export interface TransactionRecord {
    timestamp: string;
    to: string;
    amountCkb: number;
    txHash: string;
    purpose: string;
    balanceBefore: number;
    balanceAfter: number;
}

/** Full persisted wallet state for one agent. */
export interface WalletState {
    keystore: KeystoreEntry;
    constraints: SpendingConstraints;
    sessionSpend: number;
    transactionCount: number;
    ledger: TransactionRecord[];
}

/** Result of a sendTransaction call. */
export interface SendTransactionResult {
    success: boolean;
    txHash?: string;
    amountCkb?: number;
    error?: string;
    /** If blocked by a constraint, which one. */
    blockedBy?: "MAX_SPEND_PER_GAME" | "MIN_BALANCE" | "MAX_SESSION_SPEND" | "LOCK_SCRIPT";
}

/** Configuration for creating/loading a managed wallet. */
export interface WalletManagerConfig {
    /** Agent identifier — used to namespace keystore files. */
    agentId: string;
    /** Provide a private key to use. If omitted, generates or loads from keystore. */
    privateKey?: string;
    /** CKB RPC endpoint. Defaults to public testnet. */
    rpcUrl?: string;
    /** Fee rate in shannons/byte. Default: 2000. */
    feeRate?: number;
    /** Spending constraints. Uses safe defaults if omitted. */
    constraints?: Partial<SpendingConstraints>;
    /** Directory for keystore and ledger files. */
    dataDir?: string;
}

/**
 * Lock-script policy hook.
 *
 * Return `{ allowed: true }` to proceed, or `{ allowed: false, reason }`
 * to block the transaction. This is the integration point for future
 * on-chain lock-script enforcement (e.g. verifying script hashes,
 * checking type-script constraints, multi-sig requirements, etc.).
 */
export interface LockScriptPolicy {
    name: string;
    validate(params: {
        toAddress: string;
        amountCkb: number;
        walletBalance: number;
        agentId: string;
    }): Promise<{ allowed: boolean; reason?: string }>;
}

// ─── Defaults ────────────────────────────────────────────────────

const DEFAULT_CONSTRAINTS: SpendingConstraints = {
    maxSpendPerGame: 500,
    minBalanceThreshold: 61,  // CKB minimum cell capacity
    maxSessionSpend: 5000,
};

function defaultDataDir(): string {
    return resolve(import.meta.dirname ?? ".", "..", "data", "wallets");
}

// ─── Helpers ─────────────────────────────────────────────────────

function generatePrivateKey(): string {
    const bytes = randomBytes(32);
    return `0x${bytes.toString("hex")}`;
}

// ─── Wallet Manager Class ────────────────────────────────────────

export class WalletManager {
    /** The underlying AgentWallet — pass this to game adapters. */
    readonly wallet: AgentWallet;
    /** Agent ID this wallet belongs to. */
    readonly agentId: string;

    private state: WalletState;
    private stateFilePath: string;
    private log: Logger;
    private lockScriptPolicies: LockScriptPolicy[] = [];

    private constructor(
        wallet: AgentWallet,
        state: WalletState,
        stateFilePath: string,
    ) {
        this.wallet = wallet;
        this.agentId = state.keystore.agentId;
        this.state = state;
        this.stateFilePath = stateFilePath;
        this.log = new Logger("wallet-mgr");
    }

    // ─── Factory Methods ─────────────────────────────────────────

    /**
     * Create or load a managed wallet for the given agent.
     *
     * Key resolution order:
     *   1. Explicit `privateKey` in config → use it
     *   2. Existing keystore file on disk → load it
     *   3. No key found → generate a new one
     */
    static async create(config: WalletManagerConfig): Promise<WalletManager> {
        const dataDir = config.dataDir ?? defaultDataDir();
        const stateFilePath = resolve(dataDir, `${config.agentId}.json`);

        let state: WalletState | null = null;
        let privateKey: string | undefined = config.privateKey;

        // Try loading existing state
        if (existsSync(stateFilePath)) {
            const raw = await readFile(stateFilePath, "utf-8");
            state = JSON.parse(raw) as WalletState;
            privateKey = privateKey ?? state.keystore.privateKey;
        }

        // Generate key if none available
        if (!privateKey) {
            privateKey = generatePrivateKey();
        }

        // Normalize key format
        const normalizedKey = privateKey.startsWith("0x")
            ? privateKey
            : `0x${privateKey}`;

        // Create the underlying AgentWallet
        const wallet = new AgentWallet({
            privateKey: normalizedKey,
            rpcUrl: config.rpcUrl,
            feeRate: config.feeRate,
        });

        // Resolve address
        const address = await wallet.getAddress();

        // Merge constraints
        const constraints: SpendingConstraints = {
            ...DEFAULT_CONSTRAINTS,
            ...config.constraints,
        };

        // Build or update state
        if (!state) {
            state = {
                keystore: {
                    agentId: config.agentId,
                    privateKey: normalizedKey,
                    address,
                    createdAt: new Date().toISOString(),
                },
                constraints,
                sessionSpend: 0,
                transactionCount: 0,
                ledger: [],
            };
        } else {
            // Update constraints if provided in config (allows runtime changes)
            state.constraints = constraints;
            state.keystore.address = address; // re-derive in case RPC changed
        }

        const mgr = new WalletManager(wallet, state, stateFilePath);
        await mgr.persist();

        return mgr;
    }

    /**
     * Load an existing wallet. Throws if no keystore found.
     */
    static async load(
        agentId: string,
        dataDir?: string,
    ): Promise<WalletManager> {
        const dir = dataDir ?? defaultDataDir();
        const stateFilePath = resolve(dir, `${agentId}.json`);

        if (!existsSync(stateFilePath)) {
            throw new Error(
                `No wallet found for agent "${agentId}" at ${stateFilePath}. ` +
                `Use WalletManager.create() first.`,
            );
        }

        const raw = await readFile(stateFilePath, "utf-8");
        const state = JSON.parse(raw) as WalletState;

        const wallet = new AgentWallet({
            privateKey: state.keystore.privateKey,
        });

        return new WalletManager(wallet, state, stateFilePath);
    }

    // ─── Accessors ───────────────────────────────────────────────

    /** Agent's CKB address. */
    get address(): string {
        return this.state.keystore.address;
    }

    /** Current spending constraints. */
    get constraints(): Readonly<SpendingConstraints> {
        return { ...this.state.constraints };
    }

    /** Total CKB spent this session. */
    get sessionSpend(): number {
        return this.state.sessionSpend;
    }

    /** Total transactions sent. */
    get transactionCount(): number {
        return this.state.transactionCount;
    }

    /** Full transaction ledger (read-only copy). */
    get ledger(): readonly TransactionRecord[] {
        return [...this.state.ledger];
    }

    // ─── Core API ────────────────────────────────────────────────

    /** Get the current on-chain balance in CKB. */
    async getBalance(): Promise<number> {
        return this.wallet.getBalance();
    }

    /**
     * Send CKB to any address with full constraint enforcement.
     *
     * Checks (in order):
     *   1. Lock-script policies (future on-chain enforcement)
     *   2. Max spend per game
     *   3. Max session spend
     *   4. Minimum balance threshold
     *
     * All checks must pass before the transaction is built.
     */
    async sendTransaction(
        to: string,
        amountCkb: number,
        purpose = "transfer",
    ): Promise<SendTransactionResult> {
        try {
            const currentBalance = await this.getBalance();

            this.log.info(
                `sendTransaction: ${amountCkb} CKB → ${to.slice(0, 20)}… ` +
                `(balance: ${currentBalance} CKB, purpose: ${purpose})`,
            );

            // ── 1. Lock-script policy checks ─────────────────────────
            for (const policy of this.lockScriptPolicies) {
                const result = await policy.validate({
                    toAddress: to,
                    amountCkb,
                    walletBalance: currentBalance,
                    agentId: this.agentId,
                });
                if (!result.allowed) {
                    this.log.warn(
                        `Blocked by lock-script policy "${policy.name}": ${result.reason}`,
                    );
                    return {
                        success: false,
                        error: `Lock-script policy "${policy.name}": ${result.reason}`,
                        blockedBy: "LOCK_SCRIPT",
                    };
                }
            }

            // ── 2. Max spend per game ────────────────────────────────
            if (
                this.state.constraints.maxSpendPerGame > 0 &&
                amountCkb > this.state.constraints.maxSpendPerGame
            ) {
                this.log.warn(
                    `Blocked: ${amountCkb} CKB exceeds max-per-game limit ` +
                    `(${this.state.constraints.maxSpendPerGame} CKB)`,
                );
                return {
                    success: false,
                    error: `Amount ${amountCkb} CKB exceeds max spend per game (${this.state.constraints.maxSpendPerGame} CKB)`,
                    blockedBy: "MAX_SPEND_PER_GAME",
                };
            }

            // ── 3. Max session spend ─────────────────────────────────
            if (
                this.state.constraints.maxSessionSpend > 0 &&
                this.state.sessionSpend + amountCkb > this.state.constraints.maxSessionSpend
            ) {
                this.log.warn(
                    `Blocked: session spend would reach ` +
                    `${this.state.sessionSpend + amountCkb} CKB ` +
                    `(limit: ${this.state.constraints.maxSessionSpend} CKB)`,
                );
                return {
                    success: false,
                    error: `Session spend limit would be exceeded (${this.state.constraints.maxSessionSpend} CKB)`,
                    blockedBy: "MAX_SESSION_SPEND",
                };
            }

            // ── 4. Minimum balance threshold ─────────────────────────
            const projectedBalance = currentBalance - amountCkb;
            if (projectedBalance < this.state.constraints.minBalanceThreshold) {
                this.log.warn(
                    `Blocked: projected balance ${projectedBalance.toFixed(2)} CKB ` +
                    `below threshold (${this.state.constraints.minBalanceThreshold} CKB)`,
                );
                return {
                    success: false,
                    error: `Balance would drop below minimum threshold (${this.state.constraints.minBalanceThreshold} CKB)`,
                    blockedBy: "MIN_BALANCE",
                };
            }

            // ── 5. Execute the transaction ───────────────────────────
            const result = await this.wallet.enterGame(to, amountCkb);

            if (!result.success) {
                return { success: false, error: result.error };
            }

            // ── 6. Record in ledger ──────────────────────────────────
            const balanceAfter = await this.getBalance();
            const record: TransactionRecord = {
                timestamp: new Date().toISOString(),
                to,
                amountCkb: result.entryFeeCkb ?? amountCkb,
                txHash: result.txHash!,
                purpose,
                balanceBefore: currentBalance,
                balanceAfter,
            };

            this.state.ledger.push(record);
            this.state.sessionSpend += result.entryFeeCkb ?? amountCkb;
            this.state.transactionCount += 1;
            await this.persist();

            this.log.info(
                `TX confirmed: ${result.txHash} | ` +
                `Session spend: ${this.state.sessionSpend.toFixed(2)} / ` +
                `${this.state.constraints.maxSessionSpend || "∞"} CKB`,
            );

            return {
                success: true,
                txHash: result.txHash,
                amountCkb: result.entryFeeCkb,
            };
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            this.log.error(`sendTransaction failed: ${error}`);
            return { success: false, error };
        }
    }

    // ─── Constraint Management ───────────────────────────────────

    /** Update spending constraints at runtime. */
    async updateConstraints(
        updates: Partial<SpendingConstraints>,
    ): Promise<void> {
        Object.assign(this.state.constraints, updates);
        this.log.info("Constraints updated", this.state.constraints);
        await this.persist();
    }

    /** Check if a hypothetical spend would be allowed. */
    async canSpend(amountCkb: number): Promise<{
        allowed: boolean;
        reason?: string;
    }> {
        const balance = await this.getBalance();

        if (
            this.state.constraints.maxSpendPerGame > 0 &&
            amountCkb > this.state.constraints.maxSpendPerGame
        ) {
            return {
                allowed: false,
                reason: `Exceeds max-per-game (${this.state.constraints.maxSpendPerGame} CKB)`,
            };
        }

        if (
            this.state.constraints.maxSessionSpend > 0 &&
            this.state.sessionSpend + amountCkb > this.state.constraints.maxSessionSpend
        ) {
            return {
                allowed: false,
                reason: `Would exceed session limit (${this.state.constraints.maxSessionSpend} CKB)`,
            };
        }

        if (balance - amountCkb < this.state.constraints.minBalanceThreshold) {
            return {
                allowed: false,
                reason: `Balance would drop below threshold (${this.state.constraints.minBalanceThreshold} CKB)`,
            };
        }

        for (const policy of this.lockScriptPolicies) {
            const result = await policy.validate({
                toAddress: "",
                amountCkb,
                walletBalance: balance,
                agentId: this.agentId,
            });
            if (!result.allowed) {
                return { allowed: false, reason: `Policy "${policy.name}": ${result.reason}` };
            }
        }

        return { allowed: true };
    }

    // ─── Lock Script Policies ────────────────────────────────────

    /**
     * Register a lock-script policy. Policies are evaluated in order
     * before every transaction. This is the integration point for
     * future on-chain enforcement.
     *
     * Example — whitelist-only policy:
     * ```ts
     * mgr.addPolicy({
     *   name: "whitelist",
     *   async validate({ toAddress }) {
     *     const allowed = ALLOWED_ADDRESSES.includes(toAddress);
     *     return { allowed, reason: allowed ? undefined : "Address not whitelisted" };
     *   },
     * });
     * ```
     */
    addPolicy(policy: LockScriptPolicy): void {
        this.lockScriptPolicies.push(policy);
        this.log.info(`Lock-script policy registered: "${policy.name}"`);
    }

    /** Remove a policy by name. */
    removePolicy(name: string): boolean {
        const idx = this.lockScriptPolicies.findIndex((p) => p.name === name);
        if (idx >= 0) {
            this.lockScriptPolicies.splice(idx, 1);
            this.log.info(`Lock-script policy removed: "${name}"`);
            return true;
        }
        return false;
    }

    /** List registered policy names. */
    get policies(): string[] {
        return this.lockScriptPolicies.map((p) => p.name);
    }

    // ─── Session Management ──────────────────────────────────────

    /** Reset session spend counter (e.g. at the start of a new day). */
    async resetSession(): Promise<void> {
        this.state.sessionSpend = 0;
        this.log.info("Session spend counter reset");
        await this.persist();
    }

    /** Get a summary of wallet status. */
    async getSummary(): Promise<{
        agentId: string;
        address: string;
        onChainBalance: number;
        sessionSpend: number;
        maxSessionSpend: number;
        maxSpendPerGame: number;
        minBalanceThreshold: number;
        transactionCount: number;
        policiesActive: string[];
    }> {
        const balance = await this.getBalance();
        return {
            agentId: this.agentId,
            address: this.address,
            onChainBalance: balance,
            sessionSpend: this.state.sessionSpend,
            maxSessionSpend: this.state.constraints.maxSessionSpend,
            maxSpendPerGame: this.state.constraints.maxSpendPerGame,
            minBalanceThreshold: this.state.constraints.minBalanceThreshold,
            transactionCount: this.state.transactionCount,
            policiesActive: this.policies,
        };
    }

    // ─── Persistence ─────────────────────────────────────────────

    private async persist(): Promise<void> {
        const dir = dirname(this.stateFilePath);
        if (!existsSync(dir)) {
            await mkdir(dir, { recursive: true });
        }
        await writeFile(
            this.stateFilePath,
            JSON.stringify(this.state, null, 2),
            "utf-8",
        );
    }

    /**
     * Delete all persisted wallet data for this agent.
     * ⚠️  This does NOT destroy the on-chain wallet — only local state.
     */
    async destroy(): Promise<void> {
        if (existsSync(this.stateFilePath)) {
            const { unlink } = await import("node:fs/promises");
            await unlink(this.stateFilePath);
        }
        this.log.warn(`Local wallet state deleted for agent "${this.agentId}"`);
    }
}

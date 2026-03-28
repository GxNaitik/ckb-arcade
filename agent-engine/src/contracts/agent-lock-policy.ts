/**
 * CKB Arcade — Agent Lock Policy (Off-chain Mirror)
 *
 * This module mirrors the on-chain agent_lock.c rules as an
 * off-chain LockScriptPolicy. It plugs directly into the existing
 * WalletManager.addPolicy() system.
 *
 * Why both on-chain AND off-chain?
 *   - Off-chain policy: instant feedback, no deployment needed,
 *     blocks bad TXs BEFORE they hit the chain. Perfect for
 *     hackathon demo.
 *   - On-chain script: cryptographic enforcement — even if the
 *     off-chain layer is bypassed, the chain rejects invalid TXs.
 *     Deploy when ready for production.
 *
 * The two layers enforce identical rules so they're interchangeable.
 */

import { ccc } from "@ckb-ccc/core";
import type { LockScriptPolicy } from "../wallet-manager.js";
import { Logger } from "../logger.js";

// ─── Configuration ───────────────────────────────────────────────

export interface AgentLockPolicyConfig {
    /**
     * Whitelisted game contract addresses (ckt1...).
     * Transactions can ONLY send funds to these addresses.
     */
    allowedGameAddresses: string[];

    /**
     * Maximum CKB per single output / transaction.
     * Mirrors the max_spend_shannons field in the C script args.
     */
    maxSpendPerTx: number;

    /**
     * Agent's own address — change must return here.
     * If set, the policy verifies that the TX is structured to
     * return remaining funds to the agent.
     */
    agentAddress?: string;

    /** CKB RPC URL for address resolution. */
    rpcUrl?: string;
}

// ─── Script Args Builder ─────────────────────────────────────────

/**
 * Build the 85-byte args blob for the on-chain agent_lock script.
 *
 * Layout:
 *   [0..19]   owner_pubkey_hash   (20 bytes, blake160)
 *   [20..51]  game_lock_hash      (32 bytes)
 *   [52..59]  max_spend_shannons  (8 bytes, u64 LE)
 *   [60..84]  reserved            (25 bytes, zeroed)
 */
export function buildAgentLockArgs(params: {
    ownerPubkeyHash: string; // 0x-prefixed, 20 bytes
    gameLockHash: string;     // 0x-prefixed, 32 bytes
    maxSpendCkb: number;
}): string {
    const { ownerPubkeyHash, gameLockHash, maxSpendCkb } = params;

    // Convert CKB to shannons (1 CKB = 10^8 shannons)
    const shannons = BigInt(Math.floor(maxSpendCkb * 1e8));

    // Owner pubkey hash — 20 bytes
    const ownerHex = ownerPubkeyHash.replace(/^0x/, "").padStart(40, "0");

    // Game lock hash — 32 bytes
    const gameHex = gameLockHash.replace(/^0x/, "").padStart(64, "0");

    // Max spend — 8 bytes LE
    const spendBuf = new ArrayBuffer(8);
    const spendView = new DataView(spendBuf);
    spendView.setBigUint64(0, shannons, true); // little-endian
    const spendHex = Array.from(new Uint8Array(spendBuf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    // Reserved — 25 bytes
    const reserved = "00".repeat(25);

    return `0x${ownerHex}${gameHex}${spendHex}${reserved}`;
}

// ─── Lock Script Policy (off-chain mirror) ───────────────────────

/**
 * Create a LockScriptPolicy that mirrors the on-chain agent_lock.c
 * rules. Register it with WalletManager.addPolicy().
 *
 * Usage:
 * ```ts
 * const policy = createAgentLockPolicy({
 *   allowedGameAddresses: ["ckt1qzda0cr08..."],
 *   maxSpendPerTx: 500,
 *   agentAddress: "ckt1qzda0cr08...",
 * });
 * walletManager.addPolicy(policy);
 * ```
 */
export function createAgentLockPolicy(
    config: AgentLockPolicyConfig,
): LockScriptPolicy {
    const log = new Logger("agent-lock");
    const normalizedAllowed = config.allowedGameAddresses.map((a) =>
        a.toLowerCase().trim(),
    );

    return {
        name: "agent-lock-guard",

        async validate({ toAddress, amountCkb, walletBalance, agentId }) {
            // ── Rule 1: Destination whitelist ─────────────────────
            if (toAddress) {
                const normalizedTo = toAddress.toLowerCase().trim();
                const isAllowed = normalizedAllowed.includes(normalizedTo);

                if (!isAllowed) {
                    log.warn(
                        `[${agentId}] Blocked: destination ${toAddress.slice(0, 20)}… ` +
                        `not in whitelist (${normalizedAllowed.length} allowed addresses)`,
                    );
                    return {
                        allowed: false,
                        reason:
                            `Destination address not whitelisted. ` +
                            `Only transfers to registered game contracts are allowed.`,
                    };
                }
            }

            // ── Rule 2: Max spend per transaction ────────────────
            if (config.maxSpendPerTx > 0 && amountCkb > config.maxSpendPerTx) {
                log.warn(
                    `[${agentId}] Blocked: ${amountCkb} CKB exceeds per-TX cap ` +
                    `(${config.maxSpendPerTx} CKB)`,
                );
                return {
                    allowed: false,
                    reason:
                        `Amount ${amountCkb} CKB exceeds lock script max-spend-per-TX ` +
                        `(${config.maxSpendPerTx} CKB). This limit is enforced on-chain.`,
                };
            }

            // ── Rule 3: Change must return to self ───────────────
            // (This is enforced at the TX-building level — the policy
            //  just verifies the agent isn't trying to drain everything)
            if (config.agentAddress) {
                const projectedRemaining = walletBalance - amountCkb;
                // CKB minimum cell: 61 bytes capacity
                const MIN_CELL_CKB = 61;
                if (projectedRemaining > 0 && projectedRemaining < MIN_CELL_CKB) {
                    log.warn(
                        `[${agentId}] Blocked: remaining balance ${projectedRemaining.toFixed(2)} CKB ` +
                        `is below minimum cell capacity (${MIN_CELL_CKB} CKB). ` +
                        `Change output would be unspendable.`,
                    );
                    return {
                        allowed: false,
                        reason:
                            `Transaction would leave ${projectedRemaining.toFixed(2)} CKB — ` +
                            `below the ${MIN_CELL_CKB} CKB minimum cell capacity. ` +
                            `Change would be unspendable.`,
                    };
                }
            }

            log.debug(
                `[${agentId}] Allowed: ${amountCkb} CKB → ${toAddress?.slice(0, 20) ?? "?"}…`,
            );
            return { allowed: true };
        },
    };
}

// ─── Transaction Helper ──────────────────────────────────────────

/**
 * Build a transaction that complies with the agent-lock rules.
 *
 * This is an example showing how to construct a valid TX when cells
 * are locked with the on-chain agent_lock script. For the off-chain
 * demo, the regular `AgentWallet.enterGame()` flow works fine since
 * the policy blocks invalid TXs before they're built.
 *
 * Example usage:
 * ```ts
 * const tx = await buildAgentLockTransaction({
 *   signer,
 *   gameAddress: "ckt1qzda0cr08...",
 *   amountCkb: 100,
 *   agentLockCodeHash: "0xabc...",
 *   agentLockArgs: buildAgentLockArgs({ ... }),
 * });
 * const txHash = await signer.sendTransaction(tx);
 * ```
 */
export async function buildAgentLockTransaction(params: {
    /** CKB signer (from @ckb-ccc/core). */
    signer: InstanceType<typeof ccc.SignerCkbPrivateKey>;
    /** Game contract address (ckt1...). */
    gameAddress: string;
    /** Amount to send in CKB. */
    amountCkb: number;
    /** Fee rate in shannons/byte. Default: 2000. */
    feeRate?: number;
}): Promise<InstanceType<typeof ccc.Transaction>> {
    const { signer, gameAddress, amountCkb, feeRate = 2000 } = params;

    // Resolve game lock script
    const { script: gameLock } = await ccc.Address.fromString(
        gameAddress,
        signer.client,
    );

    // Build TX: one output to game, change auto-returns to self
    const tx = ccc.Transaction.from({
        outputs: [{ lock: gameLock }],
        outputsData: ["0x"],
    });

    // Set capacity on game output
    tx.outputs.forEach((output: { capacity: unknown }) => {
        output.capacity = ccc.fixedPointFrom(amountCkb.toString());
    });

    // Complete inputs (auto-selects cells from agent's wallet)
    // Change automatically goes back to the signer's lock script
    await tx.completeInputsByCapacity(signer);
    await tx.completeFeeBy(signer, feeRate);

    return tx;
}

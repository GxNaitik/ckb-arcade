/**
 * CKB Arcade — Agent Wallet
 *
 * Manages the agent's CKB wallet. Handles on-chain transactions:
 *   - Building and signing transfer transactions
 *   - Querying wallet balance
 *   - Sending entry fees to game addresses
 *
 * Uses @ckb-ccc/core — the same SDK the backend uses — so
 * transaction formats stay compatible with the existing system.
 */

import { ccc } from "@ckb-ccc/core";
import { Logger } from "./logger.js";

// ─── Types ───────────────────────────────────────────────────────

export interface WalletConfig {
    /** Agent wallet private key (hex, with or without 0x prefix). */
    privateKey: string;
    /** CKB RPC endpoint. Defaults to public testnet. */
    rpcUrl?: string;
    /** Fee rate in shannons/byte. Default: 2000. */
    feeRate?: number;
}

export interface EnterGameResult {
    /** Whether the transaction was successfully sent. */
    success: boolean;
    /** Transaction hash (if success). */
    txHash?: string;
    /** Amount of CKB sent as entry fee. */
    entryFeeCkb?: number;
    /** Error message (if failed). */
    error?: string;
}

export interface PayoutResult {
    /** Whether the payout was received. */
    success: boolean;
    /** Payout transaction hash. */
    payoutTxHash?: string;
    /** Payout amount in CKB. */
    amountCkb?: number;
    /** Error message (if failed). */
    error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────

function hexByteLength(hex: string): number {
    const h = hex.startsWith("0x") ? hex.slice(2) : hex;
    return Math.ceil(h.length / 2);
}

function scriptOccupiedBytes(script: { args: string }): number {
    return 32 + 1 + hexByteLength(script.args);
}

function minCellCapacityCkb(lock: { args: string }, dataHex: string): number {
    const dataBytes = hexByteLength(dataHex);
    const lockBytes = scriptOccupiedBytes(lock);
    return 8 + lockBytes + dataBytes;
}

// ─── Agent Wallet Class ──────────────────────────────────────────

export class AgentWallet {
    private client: InstanceType<typeof ccc.ClientPublicTestnet>;
    private signer: InstanceType<typeof ccc.SignerCkbPrivateKey>;
    private feeRate: number;
    private log: Logger;

    constructor(config: WalletConfig) {
        const key = config.privateKey.startsWith("0x")
            ? config.privateKey
            : `0x${config.privateKey}`;

        this.client = new ccc.ClientPublicTestnet(
            config.rpcUrl ? { url: config.rpcUrl } : undefined,
        );
        this.signer = new ccc.SignerCkbPrivateKey(this.client, key);
        this.feeRate = config.feeRate ?? 2000;
        this.log = new Logger("wallet");
    }

    // ─── Public API ────────────────────────────────────────────

    /** Get the agent wallet's CKB address. */
    async getAddress(): Promise<string> {
        return this.signer.getRecommendedAddress();
    }

    /** Get the agent wallet's balance in CKB. */
    async getBalance(): Promise<number> {
        const balance = await this.signer.getBalance();
        return Number(ccc.fixedPointToString(balance));
    }

    /**
     * Enter a game by sending the entry fee to the game address.
     *
     * Replicates the exact transaction format used by the frontend
     * CoinFlip component so existing backend validation passes.
     *
     * @param gameAddress  CKB testnet address (ckt1...) of the game
     * @param entryFeeCkb  Amount to wager in CKB
     */
    async enterGame(
        gameAddress: string,
        entryFeeCkb: number,
    ): Promise<EnterGameResult> {
        try {
            this.log.info(
                `Entering game — sending ${entryFeeCkb} CKB to ${gameAddress.slice(0, 20)}…`,
            );

            // Resolve the game address lock script
            const { script: toLock } = await ccc.Address.fromString(
                gameAddress,
                this.client,
            );

            // Calculate minimum cell capacity (matches frontend logic)
            const outputDataHex = "0x";
            const minCkb = minCellCapacityCkb(toLock, outputDataHex);
            const finalAmount = Math.max(entryFeeCkb, minCkb);

            // Build transaction (same structure as frontend CoinFlip)
            const tx = ccc.Transaction.from({
                outputs: [{ lock: toLock }],
                outputsData: [outputDataHex],
            });

            tx.outputs.forEach((output: { capacity: unknown }) => {
                output.capacity = ccc.fixedPointFrom(finalAmount.toString());
            });

            await tx.completeInputsByCapacity(this.signer);
            await tx.completeFeeBy(this.signer, this.feeRate);

            // Send with retry on RBF issues (matches backend pattern)
            let txHash: string | undefined;
            let lastErr: unknown;
            let currentFeeRate = this.feeRate;

            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    txHash = await this.signer.sendTransaction(tx);
                    break;
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    lastErr = e;

                    const isRbf = /PoolRejectedRBF|RBF rejected/i.test(msg);
                    const isDuplicate =
                        /PoolRejectedDuplicatedTransaction|already exists in transaction_pool/i.test(msg);

                    if (!isRbf && !isDuplicate) throw e;

                    if (isDuplicate) {
                        const hashMatch = msg.match(
                            /Transaction\(Byte32\((0x[0-9a-fA-F]{64})\)\)/,
                        );
                        if (hashMatch) {
                            txHash = hashMatch[1];
                            break;
                        }
                    }

                    // Bump fee and retry
                    currentFeeRate = Math.ceil(currentFeeRate * 1.5 + 500);
                    await tx.completeFeeBy(this.signer, currentFeeRate);
                    await new Promise((r) => setTimeout(r, 1500));
                }
            }

            if (!txHash) {
                const errMsg = lastErr instanceof Error ? lastErr.message : String(lastErr);
                throw new Error(`Transaction failed after retries: ${errMsg}`);
            }

            this.log.info(`Game entry TX sent: ${txHash}`);

            return {
                success: true,
                txHash,
                entryFeeCkb: finalAmount,
            };
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            this.log.error(`enterGame failed: ${error}`);
            return { success: false, error };
        }
    }

    /**
     * Request a payout from the backend after winning.
     *
     * Calls the existing `/api/payout` endpoint — no backend
     * changes required.
     *
     * @param apiBase     Backend API base URL (e.g. http://localhost:8787)
     * @param amountCkb   Payout amount in CKB
     * @param betTxHash   The entry-fee transaction hash (for audit)
     * @param apiKey      Optional payout API key
     */
    async requestPayout(
        apiBase: string,
        amountCkb: number,
        betTxHash: string,
        apiKey?: string,
    ): Promise<PayoutResult> {
        try {
            const walletAddress = await this.getAddress();

            this.log.info(
                `Requesting payout: ${amountCkb} CKB → ${walletAddress.slice(0, 20)}…`,
            );

            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            };
            if (apiKey) headers["x-api-key"] = apiKey;

            const resp = await fetch(`${apiBase}/api/payout`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    toAddress: walletAddress,
                    amountCkb,
                    betTxHash,
                }),
            });

            if (!resp.ok) {
                const errorData = await resp.json().catch(() => ({}));
                const errMsg = (errorData as Record<string, unknown>).error ?? `HTTP ${resp.status}`;
                throw new Error(String(errMsg));
            }

            const data = (await resp.json()) as {
                payoutTxHash: string;
                amountCkb: number;
            };

            this.log.info(`Payout received: TX ${data.payoutTxHash}`);

            return {
                success: true,
                payoutTxHash: data.payoutTxHash,
                amountCkb: data.amountCkb,
            };
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            this.log.error(`requestPayout failed: ${error}`);
            return { success: false, error };
        }
    }

    /**
     * Report game stats to the backend.
     * Calls the existing `/api/stats/:gameId` endpoint.
     */
    async reportStats(
        apiBase: string,
        gameId: string,
        wagered: number,
        won: number,
        outcome: "win" | "loss",
    ): Promise<void> {
        try {
            const walletAddress = await this.getAddress();
            await fetch(`${apiBase}/api/stats/${gameId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    playerAddress: walletAddress,
                    wagered,
                    won: outcome === "win" ? won : 0,
                    outcome,
                }),
            });
        } catch (err) {
            // Stats reporting is best-effort — never crash the agent
            this.log.warn(
                `Stats report failed: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }
}

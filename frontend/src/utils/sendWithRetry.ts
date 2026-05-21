/**
 * Send a CKB transaction with automatic RBF fee-bump retry.
 *
 * When a player has a pending transaction in the mempool, new transactions
 * must pay a higher fee to replace it (RBF). This utility handles that
 * automatically by escalating the fee rate on each retry.
 */
import { ccc } from '@ckb-ccc/connector-react';

interface SendWithRetryParams {
  /** The CCC signer instance */
  signer: ccc.Signer;
  /** Lock script of the recipient */
  toLock: ccc.Script;
  /** Amount in CKB to send */
  amountCkb: number;
  /** Output data hex (default: '0x') */
  outputDataHex?: string;
  /** Maximum retry attempts (default: 5) */
  maxAttempts?: number;
  /** Starting fee rate (default: 2000) */
  baseFeeRate?: number;
}

/**
 * Build and send a CKB transaction with automatic RBF retry.
 * On RBF rejection, escalates the fee rate by 2x + 1000 per attempt.
 * On duplicate transaction, extracts and returns the existing tx hash.
 */
export async function sendWithRetry({
  signer,
  toLock,
  amountCkb,
  outputDataHex = '0x',
  maxAttempts = 5,
  baseFeeRate = 2000,
}: SendWithRetryParams): Promise<string> {
  let lastErr: unknown;
  let feeRate = baseFeeRate;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const tx = ccc.Transaction.from({
        outputs: [{ lock: toLock }],
        outputsData: [outputDataHex],
      });
      tx.outputs.forEach((output) => {
        output.capacity = ccc.fixedPointFrom(amountCkb.toString());
      });
      await tx.completeInputsByCapacity(signer);
      await tx.completeFeeBy(signer, feeRate);
      const txHash = await signer.sendTransaction(tx);
      return txHash;
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);

      const isRbf = /PoolRejectedRBF|RBF rejected/i.test(msg);
      const isDuplicate = /PoolRejectedDuplicatedTransaction|already exists in transaction_pool/i.test(msg);

      if (isDuplicate) {
        // Extract existing tx hash if available
        const hashMatch = msg.match(/Transaction\(Byte32\((0x[0-9a-fA-F]{64})\)\)/);
        if (hashMatch) {
          return hashMatch[1];
        }
      }

      if (!isRbf && !isDuplicate) {
        // Not an RBF or duplicate error — don't retry
        throw e;
      }

      // Escalate fee: double + 1000 for next attempt
      feeRate = Math.ceil(feeRate * 2) + 1000;

      // Small delay before retry
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  throw lastErr ?? new Error('Transaction failed after fee bump retries');
}

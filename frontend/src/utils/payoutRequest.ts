/**
 * Shared payout request logic.
 *
 * Extracted from CoinFlip, DiceRoll, NumberGuess, and SpinWheel
 * to eliminate ~50 lines × 4 = 200 lines of duplication (flaw #7).
 */

export interface PayoutResult {
  payoutTxHash: string;
  amountCkb: number | null;
  error: string | null;
}

/**
 * Request a payout from the backend house wallet.
 *
 * In demo mode (no API_BASE), returns a fake payout result.
 * In production, calls /api/payout with the API key.
 */
export async function requestPayout({
  walletAddress,
  winAmount,
  betTxHash,
}: {
  walletAddress: string;
  winAmount: number;
  betTxHash: string;
}): Promise<PayoutResult> {
  const API_BASE = import.meta.env.VITE_API_BASE || '';
  const payoutApiKey = import.meta.env.VITE_PAYOUT_API_KEY;

  if (!API_BASE) {
    console.log('No API base URL set, skipping payout');
    return { payoutTxHash: 'demo-mode', amountCkb: winAmount, error: null };
  }

  const resp = await fetch(`${API_BASE}/api/payout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(payoutApiKey ? { 'x-api-key': payoutApiKey } : {}),
    },
    body: JSON.stringify({
      toAddress: walletAddress,
      amountCkb: winAmount,
      betTxHash,
    }),
  });

  if (!resp.ok) {
    let errorData: Record<string, unknown>;
    try {
      errorData = await resp.json();
    } catch {
      throw new Error(`Payout failed with status ${resp.status}: ${resp.statusText}`);
    }

    if (typeof errorData.shortfallCkb === 'number') {
      const bal = typeof errorData.houseBalanceCkb === 'string' ? errorData.houseBalanceCkb : undefined;
      const houseAddr = typeof errorData.houseAddress === 'string' ? errorData.houseAddress : undefined;
      const requested = typeof errorData.requestedAmountCkb === 'number' ? errorData.requestedAmountCkb : undefined;
      const required = typeof errorData.requiredPayoutCkb === 'number' ? errorData.requiredPayoutCkb : undefined;
      const parts = [
        `House wallet is underfunded. Shortfall: ${errorData.shortfallCkb} CKB.`,
        requested !== undefined && required !== undefined && required !== requested
          ? `Note: payout requires at least ${required} CKB (min cell capacity), even though this win is ${requested} CKB.`
          : undefined,
        bal ? `House balance: ${bal} CKB.` : undefined,
        houseAddr ? `House address: ${houseAddr}` : undefined,
      ].filter(Boolean);
      throw new Error(parts.join(' '));
    }

    throw new Error(
      (errorData.message as string) || (errorData.error as string) || `Payout failed with status ${resp.status}`,
    );
  }

  const json = await resp.json();
  return {
    payoutTxHash: json.payoutTxHash || '',
    amountCkb: typeof json.amountCkb === 'number' ? json.amountCkb : null,
    error: null,
  };
}

/**
 * Format a payout error into a user-friendly message.
 */
export function formatPayoutError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  const isFetchFailed = /fetch failed|Failed to fetch|Unexpected response format|payout service is not available/i.test(msg);
  return isFetchFailed
    ? 'Payout service is not available in this demo. To test payouts, please run the backend server locally.'
    : `Payout failed: ${msg}`;
}

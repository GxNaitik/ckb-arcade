/**
 * Commit-Reveal Provably Fair Randomness Utility
 *
 * Implements a 2-party commit-reveal scheme between the player and backend.
 * This ensures neither party can manipulate the game outcome:
 *
 * 1. Player generates a secret and sends hash(secret) to backend
 * 2. Backend generates its own secret and returns hash(houseSecret)
 * 3. Player reveals their secret
 * 4. Backend verifies and computes: random = playerSecret XOR houseSecret
 * 5. Player can verify: hash(houseSecret) matches the hash from step 2
 */

// ─── Crypto Helpers ──────────────────────────────────────────────────────────

/** Generate a cryptographically secure 32-byte random secret */
export function generateSecret(): Uint8Array {
    const secret = new Uint8Array(32);
    crypto.getRandomValues(secret);
    return secret;
}

/** Convert a Uint8Array to a hex string */
export function toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/** Convert a hex string to Uint8Array */
export function fromHex(hex: string): Uint8Array {
    const h = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes = new Uint8Array(h.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(h.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

/** Compute SHA-256 hash of a Uint8Array, returns hex string */
export async function hashSecret(secret: Uint8Array): Promise<string> {
    const buf = new ArrayBuffer(secret.byteLength);
    new Uint8Array(buf).set(secret);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buf);
    return toHex(new Uint8Array(hashBuffer));
}

/** XOR two equal-length Uint8Arrays */
export function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
    const result = new Uint8Array(a.length);
    for (let i = 0; i < a.length; i++) {
        result[i] = a[i] ^ b[i];
    }
    return result;
}

// ─── API Types ───────────────────────────────────────────────────────────────

export interface CommitResponse {
    sessionId: string;
    houseHash: string;
}

export interface RevealResponse {
    houseSecret: string;
    randomHex: string;
    outcome: GameOutcome;
    sessionId: string;
}

export interface GameOutcome {
    gameType: string;
    result: string | number;
    won: boolean;
    winAmount: number;
    details: Record<string, unknown>;
}

export interface FairnessProof {
    playerSecret: string;
    playerHash: string;
    houseSecret: string;
    houseHash: string;
    combinedRandom: string;
    sessionId: string;
    verified: boolean;
}

// ─── Commit-Reveal Flow ──────────────────────────────────────────────────────

const getApiBase = (): string => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (import.meta as any).env?.VITE_API_BASE || '';
};

/**
 * Step 1: Commit phase
 * Player generates secret, hashes it, and sends hash + bet info to backend.
 * Backend responds with its own hash commitment.
 */
export async function commitToBackend(params: {
    playerHash: string;
    gameType: string;
    betAmount: number;
    betTxHash: string;
    playerChoice?: string | number;
}): Promise<CommitResponse> {
    const API_BASE = getApiBase();
    const payoutApiKey =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (import.meta as any).env?.VITE_PAYOUT_API_KEY || '';

    const resp = await fetch(`${API_BASE}/api/commit`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(payoutApiKey ? { 'x-api-key': payoutApiKey } : {}),
        },
        body: JSON.stringify(params),
    });

    if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(
            (errorData as { error?: string }).error ||
            `Commit failed with status ${resp.status}`,
        );
    }

    return resp.json();
}

/**
 * Step 2: Reveal phase
 * Player reveals their secret. Backend verifies, computes outcome, returns
 * its own secret so the player can independently verify fairness.
 */
export async function revealToBackend(params: {
    sessionId: string;
    playerSecret: string;
}): Promise<RevealResponse> {
    const API_BASE = getApiBase();
    const payoutApiKey =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (import.meta as any).env?.VITE_PAYOUT_API_KEY || '';

    const resp = await fetch(`${API_BASE}/api/reveal`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(payoutApiKey ? { 'x-api-key': payoutApiKey } : {}),
        },
        body: JSON.stringify(params),
    });

    if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(
            (errorData as { error?: string }).error ||
            `Reveal failed with status ${resp.status}`,
        );
    }

    return resp.json();
}

/**
 * Step 3: Client-side verification
 * Verify that the house didn't cheat by checking:
 * 1. hash(houseSecret) === houseHash (committed before reveal)
 * 2. playerSecret XOR houseSecret === combinedRandom (used for outcome)
 */
export async function verifyFairness(params: {
    playerSecret: string;
    playerHash: string;
    houseSecret: string;
    houseHash: string;
    randomHex: string;
    sessionId: string;
}): Promise<FairnessProof> {
    // Verify house hash matches
    const computedHouseHash = await hashSecret(fromHex(params.houseSecret));
    const houseHashValid = computedHouseHash === params.houseHash;

    // Verify XOR result
    const playerBytes = fromHex(params.playerSecret);
    const houseBytes = fromHex(params.houseSecret);
    const computedRandom = toHex(xorBytes(playerBytes, houseBytes));
    const randomValid = computedRandom === params.randomHex;

    return {
        playerSecret: params.playerSecret,
        playerHash: params.playerHash,
        houseSecret: params.houseSecret,
        houseHash: params.houseHash,
        combinedRandom: params.randomHex,
        sessionId: params.sessionId,
        verified: houseHashValid && randomValid,
    };
}

// ─── High-Level Game Helper ──────────────────────────────────────────────────

export interface CommitRevealResult {
    outcome: GameOutcome;
    proof: FairnessProof;
}

/**
 * Execute the full commit-reveal flow for a game round.
 * This is the main function games should call.
 */
export async function playCommitReveal(params: {
    gameType: string;
    betAmount: number;
    betTxHash: string;
    playerChoice?: string | number;
}): Promise<CommitRevealResult> {
    // 1. Generate player secret
    const secret = generateSecret();
    const secretHex = toHex(secret);
    const playerHash = await hashSecret(secret);

    // 2. Commit to backend
    const commitResp = await commitToBackend({
        playerHash,
        gameType: params.gameType,
        betAmount: params.betAmount,
        betTxHash: params.betTxHash,
        playerChoice: params.playerChoice,
    });

    // 3. Reveal to backend
    const revealResp = await revealToBackend({
        sessionId: commitResp.sessionId,
        playerSecret: secretHex,
    });

    // 4. Verify fairness client-side
    const proof = await verifyFairness({
        playerSecret: secretHex,
        playerHash,
        houseSecret: revealResp.houseSecret,
        houseHash: commitResp.houseHash,
        randomHex: revealResp.randomHex,
        sessionId: commitResp.sessionId,
    });

    return {
        outcome: revealResp.outcome,
        proof,
    };
}

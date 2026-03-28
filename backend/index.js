import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { ccc } from '@ckb-ccc/core';

const PORT = Number(process.env.PORT ?? 8787);

const rawHousePrivateKey = process.env.HOUSE_PRIVATE_KEY;
const PAYOUT_API_KEY = process.env.PAYOUT_API_KEY;
const MAX_PAYOUT_CKB = Number(process.env.MAX_PAYOUT_CKB ?? 10000);
const CKB_RPC_URL = process.env.CKB_RPC_URL;

if (!rawHousePrivateKey) {
  throw new Error('Missing HOUSE_PRIVATE_KEY in backend env');
}

const HOUSE_PRIVATE_KEY = rawHousePrivateKey.startsWith('0x') ? rawHousePrivateKey : `0x${rawHousePrivateKey}`;

// Game statistics storage (in production, use a proper database)
const gameStats = {
  'spin-wheel': { totalWagered: 0, totalWon: 0, gamesPlayed: 0 },
  'dice-roll': { totalWagered: 0, totalWon: 0, gamesPlayed: 0 },
  'coin-flip': { totalWagered: 0, totalWon: 0, gamesPlayed: 0 },
  'number-guess': { totalWagered: 0, totalWon: 0, gamesPlayed: 0 },
  runner: { totalWagered: 0, totalWon: 0, gamesPlayed: 0 },
};

const playerStats = new Map(); // playerAddress -> { gameId -> stats }

function hexByteLength(hex) {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  return Math.ceil(h.length / 2);
}

function scriptOccupiedBytes(script) {
  return 32 + 1 + hexByteLength(script.args);
}

function minCellCapacityCkb({ lock, type, dataHex }) {
  const dataBytes = hexByteLength(dataHex);
  const lockBytes = scriptOccupiedBytes(lock);
  const typeBytes = type ? scriptOccupiedBytes(type) : 0;
  const occupiedBytes = 8 + lockBytes + typeBytes + dataBytes;
  return occupiedBytes;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '64kb' }));

app.get('/api/games', (req, res) => {
  const games = [
    {
      id: 'spin-wheel',
      name: 'Spin to Win',
      description: 'Spin the colorful wheel and win up to 10,000 CKB!',
      icon: '🎡',
      minBet: 100,
      maxBet: 1000,
      category: 'classic',
      difficulty: 'easy',
      rtp: 95,
      isPopular: true,
    },
    {
      id: 'dice-roll',
      name: 'CKB Dice',
      description: 'Roll the dice and predict your luck! Win 2x your bet on correct guess.',
      icon: '🎲',
      minBet: 50,
      maxBet: 500,
      category: 'luck',
      difficulty: 'easy',
      rtp: 97,
      isNew: true,
    },
    {
      id: 'coin-flip',
      name: 'Coin Flip',
      description: 'Classic 50/50 coin flip. Double your CKB on correct guess!',
      icon: '🪙',
      minBet: 25,
      maxBet: 1000,
      category: 'luck',
      difficulty: 'easy',
      rtp: 98,
      isPopular: true,
    },
    {
      id: 'number-guess',
      name: 'Number Guess',
      description: 'Guess the number 1-10. Higher risk, higher rewards!',
      icon: '🔢',
      minBet: 75,
      maxBet: 750,
      category: 'luck',
      difficulty: 'medium',
      rtp: 90,
    },
    {
      id: 'runner',
      name: 'Runner',
      description: 'Jump over hurdles and survive to win! Fixed entry fee: 200 CKB.',
      icon: '🏃',
      minBet: 200,
      maxBet: 200,
      category: 'skill',
      difficulty: 'medium',
      rtp: 92,
      isNew: true,
    },
  ];

  res.json(games);
});

app.get('/api/stats/:gameId?', (req, res) => {
  const { gameId } = req.params;

  if (gameId) {
    const stats = gameStats[gameId];
    if (!stats) {
      return res.status(404).json({ error: 'Game not found' });
    }
    res.json(stats);
  } else {
    res.json(gameStats);
  }
});

app.post('/api/stats/:gameId', (req, res) => {
  const { gameId } = req.params;
  const { playerAddress, wagered, won, outcome } = req.body;

  if (!gameStats[gameId]) {
    return res.status(404).json({ error: 'Game not found' });
  }

  // Update global game stats
  gameStats[gameId].totalWagered += Number(wagered) || 0;
  gameStats[gameId].totalWon += Number(won) || 0;
  gameStats[gameId].gamesPlayed += 1;

  // Update player stats
  if (playerAddress) {
    if (!playerStats.has(playerAddress)) {
      playerStats.set(playerAddress, {});
    }
    const playerGameStats = playerStats.get(playerAddress);
    if (!playerGameStats[gameId]) {
      playerGameStats[gameId] = {
        totalWagered: 0,
        totalWon: 0,
        gamesPlayed: 0,
        biggestWin: 0,
        lastPlayed: new Date(),
      };
    }

    playerGameStats[gameId].totalWagered += Number(wagered) || 0;
    playerGameStats[gameId].totalWon += Number(won) || 0;
    playerGameStats[gameId].gamesPlayed += 1;
    playerGameStats[gameId].biggestWin = Math.max(playerGameStats[gameId].biggestWin, Number(won) || 0);
    playerGameStats[gameId].lastPlayed = new Date();
  }

  res.json({ success: true });
});

app.get('/api/player/:address/stats', (req, res) => {
  const { address } = req.params;
  const stats = playerStats.get(address);
  res.json(stats || {});
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/house', async (req, res) => {
  try {
    if (PAYOUT_API_KEY) {
      const provided = req.header('x-api-key');
      if (!provided || provided !== PAYOUT_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const client = new ccc.ClientPublicTestnet(CKB_RPC_URL ? { url: CKB_RPC_URL } : undefined);
    const signer = new ccc.SignerCkbPrivateKey(client, HOUSE_PRIVATE_KEY);

    const address = await signer.getRecommendedAddress();
    const balance = await signer.getBalance();

    res.json({
      address,
      balanceCkb: ccc.fixedPointToString(balance),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

app.post('/api/payout', async (req, res) => {
  let signer;
  let requestedAmountCkb;
  let requiredPayoutCkb;
  try {
    if (PAYOUT_API_KEY) {
      const provided = req.header('x-api-key');
      if (!provided || provided !== PAYOUT_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const { toAddress, amountCkb, betTxHash } = req.body ?? {};

    if (typeof toAddress !== 'string' || !toAddress.startsWith('ckt1')) {
      return res.status(400).json({ error: 'Invalid toAddress (expected testnet ckt1...)' });
    }

    const amountNum = Number(amountCkb);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return res.status(400).json({ error: 'Invalid amountCkb' });
    }

    requestedAmountCkb = amountNum;

    if (amountNum > MAX_PAYOUT_CKB) {
      return res.status(400).json({ error: `amountCkb exceeds MAX_PAYOUT_CKB (${MAX_PAYOUT_CKB})` });
    }

    const client = new ccc.ClientPublicTestnet(CKB_RPC_URL ? { url: CKB_RPC_URL } : undefined);
    signer = new ccc.SignerCkbPrivateKey(client, HOUSE_PRIVATE_KEY);

    const { script: toLock } = await ccc.Address.fromString(toAddress, client);

    const outputDataHex = '0x';
    const minCkb = minCellCapacityCkb({ lock: toLock, dataHex: outputDataHex });
    const finalAmount = Math.max(amountNum, minCkb);

    requiredPayoutCkb = finalAmount;

    const buildAndSend = async (feeRate) => {
      const tx = ccc.Transaction.from({
        outputs: [{ lock: toLock, capacity: ccc.fixedPointFrom(finalAmount) }],
        outputsData: [outputDataHex],
      });

      await tx.completeInputsByCapacity(signer);
      await tx.completeFeeBy(signer, feeRate);

      return signer.sendTransaction(tx);
    };

    let payoutTxHash;
    let lastErr;
    let feeRate = 1500;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        payoutTxHash = await buildAndSend(feeRate);
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        lastErr = e;
        const isRbf = /PoolRejectedRBF|RBF rejected/i.test(msg);
        const isDuplicate = /PoolRejectedDuplicatedTransaction|already exists in transaction_pool/i.test(msg);
        if (!isRbf && !isDuplicate) {
          throw e;
        }

        if (isDuplicate) {
          const hashMatch = msg.match(/Transaction\(Byte32\((0x[0-9a-fA-F]{64})\)\)/);
          if (hashMatch) {
            payoutTxHash = hashMatch[1];
            break;
          }
        }

        feeRate = Math.ceil(feeRate * 1.5 + 500);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    if (!payoutTxHash) {
      throw lastErr ?? new Error('Payout failed after fee bump retries');
    }

    res.json({
      payoutTxHash,
      toAddress,
      amountCkb: finalAmount,
      betTxHash: typeof betTxHash === 'string' ? betTxHash : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);

    const m = msg.match(/Insufficient CKB, need\s+([0-9.]+)\s+extra CKB/i);
    if (m) {
      const shortfallCkb = Number(m[1]);
      let houseAddress;
      let houseBalanceCkb;
      try {
        if (signer) {
          houseAddress = await signer.getRecommendedAddress();
          const bal = await signer.getBalance();
          houseBalanceCkb = ccc.fixedPointToString(bal);
        }
      } catch {
        // ignore secondary failures
      }

      return res.status(402).json({
        error: msg,
        shortfallCkb,
        houseAddress,
        houseBalanceCkb,
        requestedAmountCkb,
        requiredPayoutCkb,
      });
    }

    res.status(500).json({ error: msg });
  }
});

// Survival Reward Tiers (time in seconds)
const SURVIVAL_REWARD_TIERS = {
  TIER_1: { time: 60, reward: 100 },      // 1 minute = 100 CKB
  TIER_2: { time: 300, reward: 500 },     // 5 minutes = 500 CKB
  TIER_3: { time: 600, reward: 1000 },    // 10 minutes = 1000 CKB
};

// Session tracking for anti-duplicate claims (in production, use Redis/database)
const survivalSessions = new Map(); // sessionId -> { walletAddress, survivalTime, claimed, claimedAt }

// Daily session tracking per wallet (anti-bot)
const dailySessions = new Map(); // walletAddress -> { date, count }

/**
 * Calculate reward tier based on survival time (server-side only)
 * This prevents client manipulation of reward values
 */
function calculateRewardTier(survivalTime) {
  if (survivalTime >= SURVIVAL_REWARD_TIERS.TIER_3.time) return 3;
  if (survivalTime >= SURVIVAL_REWARD_TIERS.TIER_2.time) return 2;
  if (survivalTime >= SURVIVAL_REWARD_TIERS.TIER_1.time) return 1;
  return 0;
}

/**
 * Get reward amount for tier
 */
function getRewardForTier(tier) {
  switch (tier) {
    case 3: return SURVIVAL_REWARD_TIERS.TIER_3.reward;
    case 2: return SURVIVAL_REWARD_TIERS.TIER_2.reward;
    case 1: return SURVIVAL_REWARD_TIERS.TIER_1.reward;
    default: return 0;
  }
}

/**
 * Check if wallet has exceeded daily session limit
 */
function checkDailyLimit(walletAddress, maxSessions = 5) {
  const today = new Date().toISOString().split('T')[0];
  const key = `${walletAddress}:${today}`;
  const sessions = dailySessions.get(key);

  if (!sessions) {
    dailySessions.set(key, { date: today, count: 1 });
    return { allowed: true, remaining: maxSessions - 1 };
  }

  if (sessions.count >= maxSessions) {
    return { allowed: false, remaining: 0 };
  }

  sessions.count++;
  return { allowed: true, remaining: maxSessions - sessions.count };
}

/**
 * POST /api/verify-survival
 * Secure server-side verification for survival rewards
 * 
 * Security measures:
 * 1. Server computes reward tier (not client)
 * 2. Validates session hasn't been claimed before
 * 3. Checks reasonable survival time (< 1 hour)
 * 4. Enforces daily session limit per wallet
 * 5. Marks session as claimed immediately
 */
app.post('/api/verify-survival', async (req, res) => {
  try {
    const { sessionId, walletAddress, survivalTime } = req.body;

    // Validate required fields
    if (!sessionId || !walletAddress || survivalTime === undefined) {
      return res.status(400).json({
        verified: false,
        error: 'Missing required fields: sessionId, walletAddress, survivalTime'
      });
    }

    // Validate survival time is reasonable (anti-cheat)
    if (survivalTime <= 0 || survivalTime > 3600) {
      return res.status(400).json({
        verified: false,
        error: 'Invalid survival time. Must be between 1 and 3600 seconds.'
      });
    }

    // Check for duplicate claim
    const existingSession = survivalSessions.get(sessionId);
    if (existingSession) {
      if (existingSession.claimed) {
        return res.status(409).json({
          verified: false,
          error: 'Reward already claimed for this session',
          claimedAt: existingSession.claimedAt
        });
      }
    }

    // Check daily session limit (anti-bot)
    const dailyCheck = checkDailyLimit(walletAddress, 5);
    if (!dailyCheck.allowed) {
      return res.status(429).json({
        verified: false,
        error: 'Daily session limit reached (max 5 paid sessions per day)'
      });
    }

    // Server computes reward tier (NEVER trust client-provided tier)
    const rewardTier = calculateRewardTier(survivalTime);
    const rewardAmount = getRewardForTier(rewardTier);

    // If no reward tier achieved, still mark as verified but with 0 reward
    if (rewardTier === 0) {
      survivalSessions.set(sessionId, {
        walletAddress,
        survivalTime,
        rewardTier: 0,
        rewardAmount: 0,
        claimed: true,
        claimedAt: new Date().toISOString()
      });

      return res.json({
        verified: true,
        rewardTier: 0,
        rewardAmount: 0,
        message: 'No reward achieved. Survive at least 60 seconds to earn rewards.'
      });
    }

    // Mark session as claimed before payout (prevent double-spend)
    survivalSessions.set(sessionId, {
      walletAddress,
      survivalTime,
      rewardTier,
      rewardAmount,
      claimed: true,
      claimedAt: new Date().toISOString()
    });

    // Return verification result (actual payout happens via treasury wallet)
    res.json({
      verified: true,
      rewardTier,
      rewardAmount,
      sessionId,
      dailySessionsRemaining: dailyCheck.remaining,
      message: `Reward verified: ${rewardAmount} CKB for ${survivalTime}s survival (Tier ${rewardTier})`
    });

  } catch (error) {
    console.error('Survival verification error:', error);
    res.status(500).json({
      verified: false,
      error: 'Internal server error during verification'
    });
  }
});

/**
 * GET /api/survival-stats
 * Get survival game statistics for monitoring
 */
app.get('/api/survival-stats', (req, res) => {
  const stats = {
    totalSessions: survivalSessions.size,
    claimedSessions: Array.from(survivalSessions.values()).filter(s => s.claimed).length,
    totalRewardsPaid: Array.from(survivalSessions.values())
      .filter(s => s.claimed)
      .reduce((sum, s) => sum + (s.rewardAmount || 0), 0),
    tierDistribution: {
      tier1: Array.from(survivalSessions.values()).filter(s => s.rewardTier === 1).length,
      tier2: Array.from(survivalSessions.values()).filter(s => s.rewardTier === 2).length,
      tier3: Array.from(survivalSessions.values()).filter(s => s.rewardTier === 3).length,
    }
  };

  res.json(stats);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Payout server listening on http://localhost:${PORT}`);
    console.log(`Survival reward tiers: 60s=100CKB, 300s=500CKB, 600s=1000CKB`);
  });
}

export default app;

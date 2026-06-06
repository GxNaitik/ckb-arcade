import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { ccc } from '@ckb-ccc/core';
import rateLimit from 'express-rate-limit';
import db from './db.js';

const PORT = Number(process.env.PORT ?? 8787);

const rawHousePrivateKey = process.env.HOUSE_PRIVATE_KEY;
const PAYOUT_API_KEY = process.env.PAYOUT_API_KEY;
const MAX_PAYOUT_CKB = Number(process.env.MAX_PAYOUT_CKB ?? 10000);
const CKB_RPC_URL = process.env.CKB_RPC_URL;

if (!rawHousePrivateKey) {
  throw new Error('Missing HOUSE_PRIVATE_KEY in backend env');
}

const HOUSE_PRIVATE_KEY = rawHousePrivateKey.startsWith('0x') ? rawHousePrivateKey : `0x${rawHousePrivateKey}`;

// ─── Constants & Configuration ──────────────────────────────────────────────
const SESSION_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

// Periodic cleanup of expired sessions from database
setInterval(async () => {
  const expiryTime = Date.now() - SESSION_EXPIRY_MS;
  try {
    await db.run('DELETE FROM commit_reveal_sessions WHERE created_at < ? AND phase = "committed"', [expiryTime]);
  } catch (error) {
    console.error('Failed to clear expired sessions:', error);
  }
}, 60_000);

// ─── Spin Wheel Segments (shared between frontend and backend) ────────────────
const SPIN_SEGMENTS = [
  { label: '1.5x', multiplier: 1.5, probability: 0.28 },
  { label: 'MISS', multiplier: 0, probability: 0.28 },
  { label: '2x', multiplier: 2, probability: 0.14 },
  { label: 'MISS', multiplier: 0, probability: 0.26 },
  { label: 'JACKPOT', multiplier: 50, probability: 0.005 },
  { label: '3x', multiplier: 3, probability: 0.035 },
];

/**
 * Compute game outcome deterministically from a 32-byte random hex.
 * The random is the XOR of player secret and house secret.
 */
function computeGameOutcome(randomHex, gameType, betAmount, playerChoice) {
  const randomBigInt = BigInt('0x' + randomHex.slice(0, 16));

  switch (gameType) {
    case 'coin-flip': {
      const result = randomBigInt % 2n === 0n ? 'heads' : 'tails';
      const won = result === playerChoice;
      return {
        gameType,
        result,
        won,
        winAmount: won ? betAmount * 2 : 0,
        details: { playerChoice, coinResult: result },
      };
    }

    case 'dice-roll': {
      const playerDice = Number((randomBigInt % 6n) + 1n);
      const houseBigInt = BigInt('0x' + randomHex.slice(16, 32));
      const houseDice = Number((houseBigInt % 6n) + 1n);
      let won = false;
      if (playerChoice === 'higher' && playerDice > houseDice) won = true;
      else if (playerChoice === 'lower' && playerDice < houseDice) won = true;
      else if (playerChoice === 'equal' && playerDice === houseDice) won = true;
      const multiplier = playerChoice === 'equal' ? 5.5 : 2.3;
      return {
        gameType,
        result: { playerDice, houseDice },
        won,
        winAmount: won ? Math.floor(betAmount * multiplier) : 0,
        details: { playerChoice, playerDice, houseDice, multiplier },
      };
    }

    case 'spin-wheel': {
      const totalWeight = SPIN_SEGMENTS.reduce((s, seg) => s + seg.probability, 0);
      const randomFloat = Number(randomBigInt % 10000n) / 10000;
      let accumulated = 0;
      let selectedIndex = 0;
      for (let i = 0; i < SPIN_SEGMENTS.length; i++) {
        accumulated += SPIN_SEGMENTS[i].probability / totalWeight;
        if (randomFloat <= accumulated) {
          selectedIndex = i;
          break;
        }
      }
      const segment = SPIN_SEGMENTS[selectedIndex];
      const winAmount = Math.floor(betAmount * segment.multiplier);
      return {
        gameType,
        result: { segmentIndex: selectedIndex, label: segment.label, multiplier: segment.multiplier },
        won: segment.multiplier > 0,
        winAmount,
        details: { segmentIndex: selectedIndex, label: segment.label, multiplier: segment.multiplier },
      };
    }

    case 'number-guess': {
      const target = Number((randomBigInt % 10n) + 1n);
      const chosen = Number(playerChoice);
      const won = chosen === target;
      return {
        gameType,
        result: target,
        won,
        winAmount: won ? betAmount * 10 : 0,
        details: { playerChoice: chosen, target },
      };
    }

    default:
      throw new Error(`Unknown game type: ${gameType}`);
  }
}

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

// ─── On-Chain Bet Verification Helper ──────────────────────────────────────────
async function verifyBetTransaction(betTxHash, expectedCkbAmount, purpose) {
  // 1. Prevent double spending
  const existing = await db.get('SELECT 1 FROM used_tx_hashes WHERE tx_hash = ?', [betTxHash]);
  if (existing) {
    throw new Error('Transaction hash has already been used');
  }

  // 2. Allow bypass in local dev
  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev && (betTxHash === 'demo-mode' || betTxHash.startsWith('demo-'))) {
    console.log(`[DEV ONLY] Skipping on-chain verification for demo transaction: ${betTxHash}`);
    await db.run('INSERT INTO used_tx_hashes (tx_hash, purpose) VALUES (?, ?)', [betTxHash, purpose]);
    return true;
  }

  // 3. Query blockchain
  const client = new ccc.ClientPublicTestnet(CKB_RPC_URL ? { url: CKB_RPC_URL } : undefined);
  const tx = await client.rpc.getTransaction(betTxHash);
  if (!tx || !tx.txStatus || !['committed', 'proposed', 'pending'].includes(tx.txStatus.status)) {
    throw new Error(`Transaction is not active on CKB network. Current status: ${tx ? tx.txStatus.status : 'not found'}`);
  }

  // Find the House Lock Script
  const signer = new ccc.SignerCkbPrivateKey(client, HOUSE_PRIVATE_KEY);
  const houseAddress = await signer.getRecommendedAddress();
  const { script: houseLock } = await ccc.Address.fromString(houseAddress, client);

  // 4. Verify outputs pay to house
  let found = false;
  let paidAmountShannon = 0n;
  const outputs = tx.transaction.outputs;

  for (let i = 0; i < outputs.length; i++) {
    const output = outputs[i];
    if (output.lock.codeHash === houseLock.codeHash &&
        output.lock.hashType === houseLock.hashType &&
        output.lock.args === houseLock.args) {
      found = true;
      paidAmountShannon = BigInt(output.capacity);
      break;
    }
  }

  if (!found) {
    throw new Error('No transaction output matches the house wallet address.');
  }

  const expectedShannon = BigInt(expectedCkbAmount) * 100000000n;
  if (paidAmountShannon < expectedShannon) {
    throw new Error(`Transaction payment amount too low. Expected at least ${expectedCkbAmount} CKB, found ${Number(paidAmountShannon) / 100000000} CKB.`);
  }

  // Register in database
  await db.run('INSERT INTO used_tx_hashes (tx_hash, purpose) VALUES (?, ?)', [betTxHash, purpose]);
  return true;
}

// ─── Automated Payout Executer ─────────────────────────────────────────────────
async function executePayout(toAddress, amountCkb) {
  if (typeof toAddress !== 'string' || !toAddress.startsWith('ckt1')) {
    throw new Error('Invalid toAddress (expected testnet ckt1...)');
  }

  const amountNum = Number(amountCkb);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new Error('Invalid amountCkb');
  }

  if (amountNum > MAX_PAYOUT_CKB) {
    throw new Error(`amountCkb exceeds MAX_PAYOUT_CKB (${MAX_PAYOUT_CKB})`);
  }

  const client = new ccc.ClientPublicTestnet(CKB_RPC_URL ? { url: CKB_RPC_URL } : undefined);
  const signer = new ccc.SignerCkbPrivateKey(client, HOUSE_PRIVATE_KEY);

  const { script: toLock } = await ccc.Address.fromString(toAddress, client);

  const outputDataHex = '0x';
  const minCkb = minCellCapacityCkb({ lock: toLock, dataHex: outputDataHex });
  const finalAmount = Math.max(amountNum, minCkb);

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

  return { payoutTxHash, finalAmount };
}

// ─── Statistics Updater ────────────────────────────────────────────────────────
async function updateStats(gameId, playerAddress, wagered, won) {
  try {
    await db.run(
      `UPDATE game_stats 
       SET total_wagered = total_wagered + ?, 
           total_won = total_won + ?, 
           games_played = games_played + 1 
       WHERE game_id = ?`,
      [Number(wagered) || 0, Number(won) || 0, gameId]
    );

    if (playerAddress) {
      const existing = await db.get(
        'SELECT games_played, biggest_win FROM player_stats WHERE wallet_address = ? AND game_id = ?',
        [playerAddress, gameId]
      );

      if (existing) {
        const newBiggestWin = Math.max(existing.biggest_win, Number(won) || 0);
        await db.run(
          `UPDATE player_stats 
           SET total_wagered = total_wagered + ?, 
               total_won = total_won + ?, 
               games_played = games_played + 1, 
               biggest_win = ?, 
               last_played = ? 
           WHERE wallet_address = ? AND game_id = ?`,
          [Number(wagered) || 0, Number(won) || 0, newBiggestWin, new Date().toISOString(), playerAddress, gameId]
        );
      } else {
        await db.run(
          `INSERT INTO player_stats (wallet_address, game_id, total_wagered, total_won, games_played, biggest_win, last_played) 
           VALUES (?, ?, ?, ?, 1, ?, ?)`,
          [playerAddress, gameId, Number(wagered) || 0, Number(won) || 0, Number(won) || 0, new Date().toISOString()]
        );
      }
    }
  } catch (error) {
    console.error('Failed to update stats:', error);
  }
}

// Daily limits manager
async function checkDailyLimit(walletAddress, maxSessions = 5) {
  const today = new Date().toISOString().split('T')[0];
  const row = await db.get(
    'SELECT count FROM daily_sessions WHERE wallet_address = ? AND date = ?',
    [walletAddress, today]
  );

  if (!row) {
    await db.run(
      'INSERT INTO daily_sessions (wallet_address, date, count) VALUES (?, ?, 1)',
      [walletAddress, today]
    );
    return { allowed: true, remaining: maxSessions - 1 };
  }

  if (row.count >= maxSessions) {
    return { allowed: false, remaining: 0 };
  }

  await db.run(
    'UPDATE daily_sessions SET count = count + 1 WHERE wallet_address = ? AND date = ?',
    [walletAddress, today]
  );
  return { allowed: true, remaining: maxSessions - (row.count + 1) };
}

// ─── Express App Configuration ───────────────────────────────────────────────
const app = express();

const isDev = process.env.NODE_ENV !== 'production';
const allowedOrigins = [
  'https://ckb-arcade.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin && isDev) {
        return callback(null, true);
      }
      if (!origin) {
        return callback(new Error('CORS blocked: Missing origin header'));
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: Origin ${origin} not allowed`));
      }
    },
    credentials: true,
  })
);

app.use(express.json());

// ─── Rate Limiters ────────────────────────────────────────────────────────────
const payoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many payout requests. Please wait a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const commitRevealLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many commit/reveal attempts. Please wait.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── API Endpoints ────────────────────────────────────────────────────────────
app.get('/api/games', (_req, res) => {
  const games = [
    {
      id: 'spin-wheel',
      name: 'Spin Wheel',
      description: 'Spin the wheel of fortune to multiply your CKB!',
      icon: '🎡',
      minBet: 100,
      maxBet: 1000,
      category: 'luck',
      difficulty: 'easy',
      rtp: 94,
      isPopular: true,
    },
    {
      id: 'dice-roll',
      name: 'Dice Roll',
      description: 'Predict if the next roll is higher, lower, or equal to the house roll.',
      icon: '🎲',
      minBet: 100,
      maxBet: 1000,
      category: 'luck',
      difficulty: 'medium',
      rtp: 96,
    },
    {
      id: 'coin-flip',
      name: 'Coin Flip',
      description: 'Classic 50/50 coin flip. Double your CKB on correct guess!',
      icon: '🪙',
      minBet: 100,
      maxBet: 1000,
      category: 'luck',
      difficulty: 'easy',
      rtp: 100,
      isPopular: true,
    },
    {
      id: 'number-guess',
      name: 'Number Guess',
      description: 'Guess the number 1-10. Higher risk, higher rewards! 10x payout.',
      icon: '🔢',
      minBet: 100,
      maxBet: 750,
      category: 'luck',
      difficulty: 'medium',
      rtp: 100,
    },
    {
      id: 'runner',
      name: 'CKB Dino Run',
      description: 'Jump over obstacles and survive to win CKB! Entry fee: 200 CKB.',
      icon: '🦕',
      minBet: 200,
      maxBet: 200,
      category: 'skill',
      difficulty: 'medium',
      rtp: 95,
      isNew: true,
    },
  ];

  res.json(games);
});

app.get('/api/stats/:gameId?', async (req, res) => {
  const { gameId } = req.params;
  try {
    if (gameId) {
      const stats = await db.get('SELECT * FROM game_stats WHERE game_id = ?', [gameId]);
      if (!stats) {
        return res.status(404).json({ error: 'Game not found' });
      }
      res.json({
        totalWagered: stats.total_wagered,
        totalWon: stats.total_won,
        gamesPlayed: stats.games_played,
      });
    } else {
      const rows = await db.all('SELECT * FROM game_stats');
      const stats = {};
      for (const r of rows) {
        stats[r.game_id] = {
          totalWagered: r.total_wagered,
          totalWon: r.total_won,
          gamesPlayed: r.games_played,
        };
      }
      res.json(stats);
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/stats/:gameId', async (req, res) => {
  if (PAYOUT_API_KEY) {
    const provided = req.header('x-api-key');
    if (!provided || provided !== PAYOUT_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const { gameId } = req.params;
  const { playerAddress, wagered, won } = req.body;

  try {
    const checkGame = await db.get('SELECT 1 FROM game_stats WHERE game_id = ?', [gameId]);
    if (!checkGame) {
      return res.status(404).json({ error: 'Game not found' });
    }

    await updateStats(gameId, playerAddress, wagered, won);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/player/:address/stats', async (req, res) => {
  const { address } = req.params;
  try {
    const rows = await db.all('SELECT * FROM player_stats WHERE wallet_address = ?', [address]);
    const stats = {};
    for (const r of rows) {
      stats[r.game_id] = {
        totalWagered: r.total_wagered,
        totalWon: r.total_won,
        gamesPlayed: r.games_played,
        biggestWin: r.biggest_win,
        lastPlayed: r.last_played,
      };
    }
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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

/**
 * Kept for backup/admin operations. Protected with API Key.
 */
app.post('/api/payout', payoutLimiter, async (req, res) => {
  try {
    if (PAYOUT_API_KEY) {
      const provided = req.header('x-api-key');
      if (!provided || provided !== PAYOUT_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const { toAddress, amountCkb, betTxHash } = req.body ?? {};
    const { payoutTxHash, finalAmount } = await executePayout(toAddress, amountCkb);

    if (betTxHash) {
      await db.run('INSERT OR IGNORE INTO used_tx_hashes (tx_hash, purpose) VALUES (?, "payout_bet_association")', [betTxHash]);
    }

    res.json({
      payoutTxHash,
      toAddress,
      amountCkb: finalAmount,
      betTxHash,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// ─── Commit-Reveal Endpoints ─────────────────────────────────────────────────

/**
 * POST /api/commit
 * Player commits their hash and specifies their bet transaction.
 */
app.post('/api/commit', commitRevealLimiter, async (req, res) => {
  try {
    const { playerHash, gameType, betAmount, betTxHash, playerChoice, playerAddress } = req.body;

    if (!playerHash || !gameType || betAmount === undefined || !betTxHash || !playerAddress) {
      return res.status(400).json({
        error: 'Missing required fields: playerHash, gameType, betAmount, betTxHash, playerAddress',
      });
    }

    const validGames = ['coin-flip', 'dice-roll', 'spin-wheel', 'number-guess'];
    if (!validGames.includes(gameType)) {
      return res.status(400).json({ error: `Invalid game type: ${gameType}` });
    }

    if (!/^[0-9a-f]{64}$/i.test(playerHash)) {
      return res.status(400).json({ error: 'Invalid playerHash format (expected 64-char hex)' });
    }

    // 1. Verify daily limit
    const dailyCheck = await checkDailyLimit(playerAddress, 5);
    if (!dailyCheck.allowed) {
      return res.status(429).json({
        error: 'Daily session limit reached (max 5 paid sessions per day)',
      });
    }

    // 2. Verify bet transaction on-chain
    try {
      await verifyBetTransaction(betTxHash, betAmount, `bet_${gameType}`);
    } catch (err) {
      return res.status(400).json({ error: `Bet verification failed: ${err.message}` });
    }

    // 3. Generate house secret (32 bytes)
    const houseSecret = crypto.randomBytes(32);
    const houseHash = crypto
      .createHash('sha256')
      .update(houseSecret)
      .digest('hex');

    const sessionId = crypto.randomBytes(16).toString('hex');

    await db.run(
      `INSERT INTO commit_reveal_sessions (
        session_id, player_hash, house_secret, house_hash, game_type, 
        bet_amount, bet_tx_hash, player_choice, phase, created_at, win_amount, won
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, "committed", ?, 0, 0)`,
      [
        sessionId,
        playerHash,
        houseSecret.toString('hex'),
        houseHash,
        gameType,
        Number(betAmount),
        betTxHash,
        playerChoice !== undefined ? String(playerChoice) : null,
        Date.now(),
      ]
    );

    res.json({ sessionId, houseHash });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/reveal
 * Player reveals their secret. Backend verifies, computes outcome, and distributes payouts.
 */
app.post('/api/reveal', commitRevealLimiter, async (req, res) => {
  try {
    const { sessionId, playerSecret, playerAddress } = req.body;

    if (!sessionId || !playerSecret || !playerAddress) {
      return res.status(400).json({
        error: 'Missing required fields: sessionId, playerSecret, playerAddress',
      });
    }

    const session = await db.get('SELECT * FROM commit_reveal_sessions WHERE session_id = ?', [sessionId]);
    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }

    if (session.phase !== 'committed') {
      return res.status(409).json({ error: 'Session already revealed' });
    }

    if (Date.now() - session.created_at > SESSION_EXPIRY_MS) {
      await db.run('DELETE FROM commit_reveal_sessions WHERE session_id = ?', [sessionId]);
      return res.status(410).json({ error: 'Session expired' });
    }

    if (!/^[0-9a-f]{64}$/i.test(playerSecret)) {
      return res.status(400).json({ error: 'Invalid playerSecret format (expected 64-char hex)' });
    }

    const computedPlayerHash = crypto
      .createHash('sha256')
      .update(Buffer.from(playerSecret, 'hex'))
      .digest('hex');

    if (computedPlayerHash !== session.player_hash) {
      await db.run('UPDATE commit_reveal_sessions SET phase = "failed" WHERE session_id = ?', [sessionId]);
      return res.status(400).json({
        error: 'Player secret does not match committed hash. Cheating detected.',
      });
    }

    // XOR secrets
    const playerBytes = Buffer.from(playerSecret, 'hex');
    const houseBytes = Buffer.from(session.house_secret, 'hex');
    const randomBytes = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) {
      randomBytes[i] = playerBytes[i] ^ houseBytes[i];
    }
    const randomHex = randomBytes.toString('hex');

    // Compute outcome
    const outcome = computeGameOutcome(
      randomHex,
      session.game_type,
      session.bet_amount,
      session.player_choice
    );

    let payoutTxHash = null;
    let finalPayoutAmount = 0;

    // Trigger payout on win
    if (outcome.won && outcome.winAmount > 0) {
      try {
        const payout = await executePayout(playerAddress, outcome.winAmount);
        payoutTxHash = payout.payoutTxHash;
        finalPayoutAmount = payout.finalAmount;
      } catch (payoutErr) {
        console.error('Automated reveal payout failed:', payoutErr);
      }
    }

    // Update session state in SQLite
    await db.run(
      `UPDATE commit_reveal_sessions 
       SET phase = "revealed", payout_tx_hash = ?, win_amount = ?, won = ?
       WHERE session_id = ?`,
      [payoutTxHash, finalPayoutAmount, outcome.won ? 1 : 0, sessionId]
    );

    // Update global and player stats
    await updateStats(session.game_type, playerAddress, session.bet_amount, finalPayoutAmount);

    res.json({
      houseSecret: session.house_secret,
      randomHex,
      outcome: {
        ...outcome,
        winAmount: finalPayoutAmount,
      },
      sessionId,
      payoutTxHash,
      payoutAmountCkb: finalPayoutAmount,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

// ─── Survival (Endless Runner) Endpoints ─────────────────────────────────────
const SURVIVAL_REWARD_TIERS = {
  TIER_1: { time: 60, reward: 200 },      // 1 minute = 200 CKB
  TIER_2: { time: 300, reward: 500 },     // 5 minutes = 500 CKB
  TIER_3: { time: 600, reward: 1000 },    // 10 minutes = 1000 CKB
};

function calculateRewardTier(survivalTime) {
  if (survivalTime >= SURVIVAL_REWARD_TIERS.TIER_3.time) return 3;
  if (survivalTime >= SURVIVAL_REWARD_TIERS.TIER_2.time) return 2;
  if (survivalTime >= SURVIVAL_REWARD_TIERS.TIER_1.time) return 1;
  return 0;
}

function getRewardForTier(tier) {
  switch (tier) {
    case 3: return SURVIVAL_REWARD_TIERS.TIER_3.reward;
    case 2: return SURVIVAL_REWARD_TIERS.TIER_2.reward;
    case 1: return SURVIVAL_REWARD_TIERS.TIER_1.reward;
    default: return 0;
  }
}

/**
 * POST /api/start-survival
 * Starts a trackable Endless Runner session on server side.
 */
app.post('/api/start-survival', commitRevealLimiter, async (req, res) => {
  try {
    const { betTxHash, walletAddress } = req.body;

    if (!betTxHash || !walletAddress) {
      return res.status(400).json({ error: 'Missing required fields: betTxHash, walletAddress' });
    }

    // 1. Verify daily limit
    const dailyCheck = await checkDailyLimit(walletAddress, 5);
    if (!dailyCheck.allowed) {
      return res.status(429).json({ error: 'Daily session limit reached (max 5 paid sessions per day)' });
    }

    // 2. Verify 200 CKB entry fee transaction
    try {
      await verifyBetTransaction(betTxHash, 200, 'survival_entry_fee');
    } catch (err) {
      return res.status(400).json({ error: `Bet transaction verification failed: ${err.message}` });
    }

    const sessionId = `session_runner_${crypto.randomBytes(8).toString('hex')}`;
    const now = Date.now();

    await db.run(
      `INSERT INTO survival_sessions (session_id, wallet_address, bet_tx_hash, start_time, claimed, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
      [sessionId, walletAddress, betTxHash, now, now]
    );

    res.json({ sessionId, startTime: now });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/verify-survival
 * Verifies player survival time against server start time, computes rewards, executes payout.
 */
app.post('/api/verify-survival', async (req, res) => {
  try {
    const { sessionId, walletAddress, survivalTime } = req.body;

    if (!sessionId || !walletAddress || survivalTime === undefined) {
      return res.status(400).json({
        verified: false,
        error: 'Missing required fields: sessionId, walletAddress, survivalTime'
      });
    }

    const session = await db.get('SELECT * FROM survival_sessions WHERE session_id = ?', [sessionId]);
    if (!session) {
      return res.status(404).json({
        verified: false,
        error: 'Survival session not found. Play session was not started correctly.'
      });
    }

    if (session.claimed) {
      return res.status(409).json({
        verified: false,
        error: 'Reward already claimed for this session'
      });
    }

    const elapsedSeconds = Math.floor((Date.now() - session.start_time) / 1000);

    // Anti-cheat: Client reported survival time cannot be longer than real elapsed server time
    if (survivalTime > elapsedSeconds + 5) {
      await db.run('UPDATE survival_sessions SET claimed = 1 WHERE session_id = ?', [sessionId]);
      return res.status(400).json({
        verified: false,
        error: `Speed hack or cheating detected. Reported time: ${survivalTime}s, Server elapsed: ${elapsedSeconds}s.`
      });
    }

    // Determine the authoritative survival time
    const authoritativeTime = Math.min(survivalTime, elapsedSeconds);
    const rewardTier = calculateRewardTier(authoritativeTime);
    const rewardAmount = getRewardForTier(rewardTier);

    let payoutTxHash = null;
    let finalAmount = 0;

    if (rewardTier > 0 && rewardAmount > 0) {
      try {
        const payout = await executePayout(walletAddress, rewardAmount);
        payoutTxHash = payout.payoutTxHash;
        finalAmount = payout.finalAmount;
      } catch (payoutErr) {
        console.error('Automated survival payout failed:', payoutErr);
      }
    }

    // Mark session as claimed in SQLite
    await db.run(
      `UPDATE survival_sessions 
       SET survival_time = ?, reward_tier = ?, reward_amount = ?, claimed = 1, payout_tx_hash = ?
       WHERE session_id = ?`,
      [authoritativeTime, rewardTier, finalAmount, payoutTxHash, sessionId]
    );

    // Update global and player stats
    await updateStats('runner', walletAddress, 200, finalAmount);

    res.json({
      verified: true,
      rewardTier,
      rewardAmount: finalAmount,
      sessionId,
      payoutTxHash,
      message: rewardAmount > 0 
        ? `Reward verified: ${finalAmount} CKB for ${authoritativeTime}s survival (Tier ${rewardTier})`
        : `No reward tier achieved. Survived ${authoritativeTime}s. (Required: 60s)`
    });

  } catch (error) {
    console.error('Survival verification error:', error);
    res.status(500).json({
      verified: false,
      error: 'Internal server error during verification'
    });
  }
});

app.get('/api/survival-stats', async (_req, res) => {
  try {
    const rows = await db.all('SELECT * FROM survival_sessions WHERE claimed = 1');
    const totalSessions = rows.length;
    const claimedSessions = rows.filter(s => s.reward_amount > 0).length;
    const totalRewardsPaid = rows.reduce((sum, s) => sum + (s.reward_amount || 0), 0);
    const tierDistribution = {
      tier1: rows.filter(s => s.reward_tier === 1).length,
      tier2: rows.filter(s => s.reward_tier === 2).length,
      tier3: rows.filter(s => s.reward_tier === 3).length,
    };

    res.json({
      totalSessions,
      claimedSessions,
      totalRewardsPaid,
      tierDistribution,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Error handling middleware
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Payout server listening on http://localhost:${PORT}`);
    console.log(`Survival reward tiers: 60s=200CKB, 300s=500CKB, 600s=1000CKB`);
  });
}

export default app;

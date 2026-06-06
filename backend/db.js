import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, 'db.sqlite');

const db = new sqlite3.Database(dbPath);

// Helper to run query with Promise
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

// Helper to get single row
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// Helper to get all rows
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Initialize tables sequentially with await
async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS used_tx_hashes (
      tx_hash TEXT PRIMARY KEY,
      purpose TEXT,
      used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS commit_reveal_sessions (
      session_id TEXT PRIMARY KEY,
      player_hash TEXT,
      house_secret TEXT,
      house_hash TEXT,
      game_type TEXT,
      bet_amount INTEGER,
      bet_tx_hash TEXT,
      player_choice TEXT,
      phase TEXT,
      payout_tx_hash TEXT,
      win_amount INTEGER,
      won INTEGER,
      created_at INTEGER
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS survival_sessions (
      session_id TEXT PRIMARY KEY,
      wallet_address TEXT,
      bet_tx_hash TEXT,
      start_time INTEGER,
      survival_time INTEGER,
      reward_tier INTEGER,
      reward_amount INTEGER,
      claimed INTEGER DEFAULT 0,
      payout_tx_hash TEXT,
      created_at INTEGER
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS daily_sessions (
      wallet_address TEXT,
      date TEXT,
      count INTEGER,
      PRIMARY KEY (wallet_address, date)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS game_stats (
      game_id TEXT PRIMARY KEY,
      total_wagered INTEGER DEFAULT 0,
      total_won INTEGER DEFAULT 0,
      games_played INTEGER DEFAULT 0
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS player_stats (
      wallet_address TEXT,
      game_id TEXT,
      total_wagered INTEGER DEFAULT 0,
      total_won INTEGER DEFAULT 0,
      games_played INTEGER DEFAULT 0,
      biggest_win INTEGER DEFAULT 0,
      last_played TEXT,
      PRIMARY KEY (wallet_address, game_id)
    )
  `);

  // Insert default stats if they don't exist
  const defaultGames = ['spin-wheel', 'dice-roll', 'coin-flip', 'number-guess', 'runner'];
  for (const g of defaultGames) {
    await run(`INSERT OR IGNORE INTO game_stats (game_id, total_wagered, total_won, games_played) VALUES (?, 0, 0, 0)`, [g]);
  }
}

await initDb();

export default {
  run,
  get,
  all,
  initDb,
};

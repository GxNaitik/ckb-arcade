/**
 * CKB Configuration for Endless Runner Game
 * Contains all CKB-related configuration and constants
 */

export const CKB_CONFIG = {
  // Game Economics
  ENTRY_FEE_CKB: 199, // Entry fee in CKB
  REWARD_CKB: 400, // Victory reward in CKB
  COIN_VALUE_CKB: 10, // Value per collected coin in CKB
  
  // Transaction Fees
  TRANSACTION_FEE_RATE: 0.001, // 0.1% fee rate
  
  // Contract Addresses (replace with actual addresses)
  GAME_CONTRACT: {
    TESTNET: 'ckb1qyq...replace-with-testnet-contract-address',
    MAINNET: 'ckb1qyq...replace-with-mainnet-contract-address',
  },
  
  // Network Configuration
  NETWORK: {
    TESTNET: {
      name: 'testnet',
      ckbRpcUrl: 'https://testnet.ckb.dev/rpc',
      ckbIndexerUrl: 'https://testnet.ckb.dev/indexer',
      explorerUrl: 'https://pudge.explorer.nervos.org',
    },
    MAINNET: {
      name: 'mainnet',
      ckbRpcUrl: 'https://mainnet.ckb.dev/rpc',
      ckbIndexerUrl: 'https://mainnet.ckb.dev/indexer',
      explorerUrl: 'https://explorer.nervos.org',
    },
  },
  
  // Transaction Monitoring
  MONITORING: {
    POLL_INTERVAL: 5000, // 5 seconds
    TIMEOUT: 120000, // 2 minutes
    MAX_RETRIES: 3,
  },
  
  // Game Session Limits
  SESSION: {
    MAX_DURATION: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    MIN_DURATION: 30 * 1000, // 30 seconds minimum
  },
  
  // Anti-Cheat Settings
  ANTI_CHEAT: {
    ENABLED: true,
    MAX_WIN_RATE: 45, // Maximum 45% win rate
    SUSPICIOUS_THRESHOLD: 80, // Win rate above 80% triggers review
  },
  
  // UI Settings
  UI: {
    TRANSACTION_HISTORY_LIMIT: 50, // Maximum transactions to display
    BALANCE_DECIMALS: 8, // Maximum decimal places for balance display
    REFRESH_INTERVAL: 5000, // Balance refresh interval in milliseconds
  },
  
  // Storage Keys
  STORAGE: {
    TRANSACTIONS: 'ckb_game_transactions',
    CURRENT_SESSION: 'ckb_game_current_session',
    SETTINGS: 'ckb_game_settings',
    STATISTICS: 'ckb_game_statistics',
  },
  
  // Error Messages
  ERRORS: {
    INSUFFICIENT_BALANCE: (required: number, available: number) => 
      `Insufficient balance. Need ${required} CKB, have ${available} CKB`,
    WALLET_NOT_CONNECTED: 'Wallet not connected. Please connect your wallet to play.',
    TRANSACTION_FAILED: 'Transaction failed. Please try again.',
    NETWORK_ERROR: 'Network error. Please check your connection.',
    SESSION_EXPIRED: 'Game session expired. Please start a new game.',
    CONTRACT_ERROR: 'Contract execution failed. Please contact support.',
  },
  
  // Success Messages
  SUCCESS: {
    TRANSACTION_CONFIRMED: 'Transaction confirmed successfully!',
    GAME_STARTED: 'Game started! Entry fee paid.',
    REWARD_CLAIMED: 'Reward claimed successfully!',
  },
  
  // Transaction Types
  TRANSACTION_TYPES: {
    ENTRY_FEE: 'entry_fee',
    REWARD: 'reward',
    COIN_COLLECTION: 'coin_collection',
  } as const,
  
  // Game States
  GAME_STATES: {
    IDLE: 'idle',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAMEOVER: 'gameover',
  } as const,
  
  // Transaction States
  TRANSACTION_STATES: {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    FAILED: 'failed',
  } as const,
} as const;

/**
 * Get network configuration based on environment
 */
export function getNetworkConfig(network: 'testnet' | 'mainnet' = 'testnet') {
  return CKB_CONFIG.NETWORK[network.toUpperCase() as keyof typeof CKB_CONFIG.NETWORK];
}

/**
 * Get game contract address based on network
 */
export function getGameContractAddress(network: 'testnet' | 'mainnet' = 'testnet') {
  return CKB_CONFIG.GAME_CONTRACT[network.toUpperCase() as keyof typeof CKB_CONFIG.GAME_CONTRACT];
}

/**
 * Format CKB amount for display
 */
export function formatCkbAmount(amount: number, decimals: number = CKB_CONFIG.UI.BALANCE_DECIMALS): string {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  });
}

/**
 * Convert CKB to shannon (1 CKB = 100,000,000 shannon)
 */
export function ckbToShannon(ckb: number): number {
  return Math.floor(ckb * 100000000);
}

/**
 * Convert shannon to CKB
 */
export function shannonToCkb(shannon: number): number {
  return shannon / 100000000;
}

/**
 * Calculate transaction fee
 */
export function calculateTransactionFee(amount: number): number {
  return Math.floor(amount * CKB_CONFIG.TRANSACTION_FEE_RATE);
}

/**
 * Get explorer URL for transaction
 */
export function getExplorerUrl(txHash: string, network: 'testnet' | 'mainnet' = 'testnet'): string {
  const config = getNetworkConfig(network);
  return `${config.explorerUrl}/transaction/${txHash}`;
}

/**
 * Format transaction hash for display
 */
export function formatTxHash(hash: string, startChars: number = 8, endChars: number = 8): string {
  if (hash.length <= startChars + endChars) {
    return hash;
  }
  return `${hash.slice(0, startChars)}...${hash.slice(-endChars)}`;
}

/**
 * Validate game session
 */
export function validateGameSession(startTime: number, endTime?: number): boolean {
  const now = Date.now();
  const duration = endTime ? endTime - startTime : now - startTime;
  
  return duration >= CKB_CONFIG.SESSION.MIN_DURATION && 
         duration <= CKB_CONFIG.SESSION.MAX_DURATION;
}

/**
 * Check if win rate is suspicious
 */
export function isSuspiciousWinRate(winRate: number): boolean {
  return winRate > CKB_CONFIG.ANTI_CHEAT.SUSPICIOUS_THRESHOLD;
}

/**
 * Get error message by key
 */
export function getErrorMessage(key: keyof typeof CKB_CONFIG.ERRORS, ...args: any[]): string {
  const message = CKB_CONFIG.ERRORS[key];
  if (typeof message === 'function') {
    // Type assertion to handle function call with spread arguments
    return (message as (...args: any[]) => string)(...args);
  }
  return message;
}

/**
 * Get success message by key
 */
export function getSuccessMessage(key: keyof typeof CKB_CONFIG.SUCCESS): string {
  return CKB_CONFIG.SUCCESS[key];
}

/**
 * Type definitions
 */
export type NetworkType = 'testnet' | 'mainnet';
export type TransactionType = typeof CKB_CONFIG.TRANSACTION_TYPES[keyof typeof CKB_CONFIG.TRANSACTION_TYPES];
export type GameState = typeof CKB_CONFIG.GAME_STATES[keyof typeof CKB_CONFIG.GAME_STATES];
export type TransactionState = typeof CKB_CONFIG.TRANSACTION_STATES[keyof typeof CKB_CONFIG.TRANSACTION_STATES];

/**
 * Default export
 */
export default CKB_CONFIG;

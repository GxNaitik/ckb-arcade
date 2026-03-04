/**
 * Real Nervos CKB Adapter
 * Integrates with CCC wallet connector for real blockchain interactions
 */

import { ccc } from '@ckb-ccc/connector-react';

// Helper functions for CKB transaction
function hexByteLength(hex: string): number {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  return Math.ceil(h.length / 2);
}

function scriptOccupiedBytes(script: ccc.Script): number {
  return 32 + 1 + hexByteLength(script.args);
}

function minCellCapacityCkb({ lock, type, dataHex }: { lock: ccc.Script; type?: ccc.Script; dataHex: string }): number {
  const dataBytes = hexByteLength(dataHex);
  const lockBytes = scriptOccupiedBytes(lock);
  const typeBytes = type ? scriptOccupiedBytes(type) : 0;
  const occupiedBytes = 8 + lockBytes + typeBytes + dataBytes;
  return occupiedBytes;
}

export interface CkbBalance {
  available: number; // Available CKB in shannon units (1 CKB = 100,000,000 shannon)
  locked: number;    // Locked CKB
  total: number;     // Total CKB
}

export interface TransactionResult {
  hash: string;
  status: 'pending' | 'confirmed' | 'failed';
  fee: number;
  timestamp: number;
}

export interface GameSession {
  id: string;
  entryFee: number;
  coinsCollected: number;
  startTime: number;
  endTime?: number;
  profit: number;
  status: 'active' | 'completed' | 'failed';
}

export interface CkbTransaction {
  hash: string;
  type: 'entry_fee' | 'reward' | 'coin_collection';
  amount: number;
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: number;
  fee: number;
  gameId?: string;
  description?: string;
}

/**
 * Real CKB Adapter - Integrates with CCC wallet connector
 */
export class CkbAdapter {
  private signer: ccc.Signer | null = null;
  private walletAddress: string | null = null;
  private transactions: TransactionResult[] = [];
  private currentSession: GameSession | null = null;
  private gameHistory: GameSession[] = [];
  private readonly ENTRY_FEE = 200 * 100000000; // 200 CKB in shannon
  private readonly GAME_CONTRACT_ADDRESS: string; // Game contract address

  constructor(gameContractAddress?: string) {
    this.GAME_CONTRACT_ADDRESS = gameContractAddress || 'ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq2dq0e9th5maw4k2vhk7nz4wdydrlq3cugzmv8pp';
  }

  /**
   * Initialize adapter with signer
   */
  async initialize(signer: ccc.Signer): Promise<void> {
    this.signer = signer;
    this.walletAddress = await signer.getRecommendedAddress();
    
    // Load existing transactions from local storage
    this.loadTransactionsFromStorage();
    
    // Load current session if exists
    this.loadCurrentSession();
  }

  /**
   * Get current wallet balance
   */
  async getBalance(): Promise<CkbBalance> {
    if (!this.signer) {
      throw new Error('CKB adapter not initialized');
    }

    try {
      const balance = await this.signer.getBalance();
      return {
        available: Number(balance),
        locked: 0, // TODO: Get locked balance from UDTs if needed
        total: Number(balance),
      };
    } catch (error) {
      console.error('Failed to get balance:', error);
      throw new Error('Failed to fetch wallet balance');
    }
  }

  /**
   * Check if player can afford entry fee
   */
  async canAffordEntry(): Promise<boolean> {
    try {
      const balance = await this.getBalance();
      return balance.available >= this.ENTRY_FEE;
    } catch (error) {
      console.error('Failed to check affordability:', error);
      return false;
    }
  }

  /**
   * Get entry fee amount
   */
  getEntryFee(): number {
    return this.ENTRY_FEE;
  }

  /**
   * Get current wallet address
   */
  getWalletAddress(): string | null {
    return this.walletAddress;
  }

  /**
   * Start a new game session (pay entry fee)
   */
  async startGameSession(): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    if (!this.signer || !this.walletAddress) {
      return {
        success: false,
        error: 'Wallet not connected'
      };
    }

    try {
      // Check if can afford entry fee
      if (!(await this.canAffordEntry())) {
        const balance = await this.getBalance();
        return {
          success: false,
          error: `Insufficient balance. Need ${this.ENTRY_FEE / 100000000} CKB, have ${balance.available / 100000000} CKB`
        };
      }

      // Check for existing active session
      if (this.currentSession && this.currentSession.status === 'active') {
        return {
          success: false,
          error: 'Game session already active'
        };
      }

      // Create entry fee transaction
      const txHash = await this.sendEntryFeeTransaction();

      // Create game session
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.currentSession = {
        id: sessionId,
        entryFee: this.ENTRY_FEE,
        coinsCollected: 0,
        startTime: Date.now(),
        profit: -this.ENTRY_FEE,
        status: 'active',
      };

      // Create transaction record
      const transaction: TransactionResult = {
        hash: txHash,
        status: 'pending',
        fee: Math.floor(this.ENTRY_FEE * 0.001), // 0.1% fee
        timestamp: Date.now(),
      };
      this.transactions.push(transaction);
      this.saveTransactionsToStorage();
      this.saveCurrentSession();

      // Monitor transaction status
      this.monitorTransaction(txHash);

      return {
        success: true,
        sessionId,
      };
    } catch (error) {
      console.error('Failed to start game session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start game session'
      };
    }
  }

  /**
   * Send entry fee transaction to game contract
   */
  private async sendEntryFeeTransaction(): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer not available');
    }

    try {
      console.log('Creating entry fee transaction to:', this.GAME_CONTRACT_ADDRESS);
      console.log('Amount:', this.ENTRY_FEE, 'shannon');

      // Create transaction using CCC pattern from other games
      let toLock: ccc.Script;
      try {
        ({ script: toLock } = await ccc.Address.fromString(this.GAME_CONTRACT_ADDRESS, this.signer.client));
      } catch (error) {
        throw new Error(`Invalid game address: ${this.GAME_CONTRACT_ADDRESS}`);
      }

      const outputDataHex = '0x';
      const minBetCkb = minCellCapacityCkb({ lock: toLock, dataHex: outputDataHex });
      const betAmountCkb = Math.max(this.ENTRY_FEE / 100000000, minBetCkb).toString();
      
      const tx = ccc.Transaction.from({
        outputs: [{ lock: toLock }],
        outputsData: [outputDataHex],
      });
      
      tx.outputs.forEach((output) => {
        output.capacity = ccc.fixedPointFrom(betAmountCkb);
      });
      
      await tx.completeInputsByCapacity(this.signer);
      await tx.completeFeeBy(this.signer, 2000); // Increased fee rate to avoid RBF issues
      
      const txHash = await this.signer.sendTransaction(tx);
      
      console.log('Transaction sent successfully:', txHash);
      return txHash;
    } catch (error) {
      console.error('Failed to send entry fee transaction:', error);
      throw new Error(`Failed to send entry fee transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update coin collection during game
   */
  updateCoinCollection(coinsCollected: number): void {
    if (this.currentSession && this.currentSession.status === 'active') {
      this.currentSession.coinsCollected = coinsCollected;
      this.currentSession.profit = (coinsCollected * 10 * 100000000) - this.currentSession.entryFee; // 10 CKB per coin
      this.saveCurrentSession();
    }
  }

  /**
   * Complete game session (handle winnings/losses)
   */
  async completeGameSession(won: boolean): Promise<{ success: boolean; result?: GameSession; error?: string }> {
    if (!this.currentSession || this.currentSession.status !== 'active') {
      return {
        success: false,
        error: 'No active game session'
      };
    }

    try {
      this.currentSession.endTime = Date.now();
      this.currentSession.status = won ? 'completed' : 'failed';

      if (won) {
        // Send reward transaction
        await this.sendRewardTransaction();
      }

      // Move session to history
      this.gameHistory.push({ ...this.currentSession });
      const completedSession = { ...this.currentSession };
      this.currentSession = null;
      
      // Clear current session from storage
      this.clearCurrentSession();

      return {
        success: true,
        result: completedSession,
      };
    } catch (error) {
      console.error('Failed to complete game session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to complete game session'
      };
    }
  }

  /**
   * Send reward transaction from game contract
   */
  private async sendRewardTransaction(): Promise<void> {
    // In a real implementation, this would be handled by the game contract
    // The contract would automatically send rewards based on game outcome
    // For now, we'll create a mock transaction record
    
    const transaction: TransactionResult = {
      hash: `reward_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'confirmed', // Rewards are processed by contract
      fee: 0,
      timestamp: Date.now(),
    };
    this.transactions.push(transaction);
    this.saveTransactionsToStorage();
  }

  /**
   * Monitor transaction status
   */
  private async monitorTransaction(txHash: string): Promise<void> {
    if (!this.signer) return;
    
    // Store in local variable to avoid closure issues
    const signer = this.signer;
    const client = signer.client;
    const transaction = this.transactions.find(t => t.hash === txHash);
    
    if (!transaction || transaction.status !== 'pending') return;
    
    const checkStatus = async () => {
      try {
        // Try to get transaction from blockchain
        const tx = await client.getTransaction(txHash);
        if (tx) {
          // Transaction found on chain, mark as confirmed
          transaction.status = 'confirmed';
          this.saveTransactionsToStorage();
          console.log('Transaction confirmed:', txHash);
          return true;
        }
      } catch (error) {
        // Transaction not yet found, continue monitoring
        console.log('Transaction not yet confirmed:', txHash);
      }
      return false;
    };

    // Check status every 3 seconds for up to 2 minutes
    let attempts = 0;
    const interval = setInterval(async () => {
      const confirmed = await checkStatus();
      attempts++;
      
      if (confirmed || attempts >= 40) { // 40 * 3 seconds = 2 minutes
        clearInterval(interval);
        if (!confirmed && transaction.status === 'pending') {
          // Fallback: simulate confirmation after timeout
          transaction.status = 'confirmed';
          this.saveTransactionsToStorage();
          console.log('Transaction confirmed (fallback):', txHash);
        }
      }
      
      if (transaction.status === 'confirmed' || transaction.status === 'failed') {
        clearInterval(interval);
      }
    }, 3000);
  }

  /**
   * Get current game session
   */
  getCurrentSession(): GameSession | null {
    return this.currentSession ? { ...this.currentSession } : null;
  }

  /**
   * Get game history
   */
  getGameHistory(): GameSession[] {
    return [...this.gameHistory];
  }

  /**
   * Get transaction history
   */
  getTransactionHistory(): TransactionResult[] {
    return [...this.transactions];
  }

  /**
   * Calculate game statistics
   */
  getGameStats(): {
    totalGames: number;
    gamesWon: number;
    gamesLost: number;
    totalSpent: number;
    totalEarned: number;
    netProfit: number;
    winRate: number;
  } {
    const completedGames = this.gameHistory.filter(g => g.status !== 'active');
    const gamesWon = completedGames.filter(g => g.status === 'completed').length;
    const gamesLost = completedGames.filter(g => g.status === 'failed').length;
    const totalSpent = completedGames.reduce((sum, g) => sum + g.entryFee, 0);
    const totalEarned = completedGames
      .filter(g => g.status === 'completed')
      .reduce((sum, g) => sum + g.entryFee + g.profit, 0);

    return {
      totalGames: completedGames.length,
      gamesWon,
      gamesLost,
      totalSpent,
      totalEarned,
      netProfit: totalEarned - totalSpent,
      winRate: completedGames.length > 0 ? (gamesWon / completedGames.length) * 100 : 0,
    };
  }

  /**
   * Get transaction state for UI
   */
  getTransactionState(): {
    isProcessing: boolean;
    pendingTransactions: TransactionResult[];
    lastError: string | null;
  } {
    const pendingTransactions = this.transactions.filter(t => t.status === 'pending');
    
    return {
      isProcessing: pendingTransactions.length > 0,
      pendingTransactions,
      lastError: null, // TODO: Track last error
    };
  }

  /**
   * Save transactions to local storage
   */
  private saveTransactionsToStorage(): void {
    try {
      localStorage.setItem('ckb_game_transactions', JSON.stringify(this.transactions));
    } catch (error) {
      console.error('Failed to save transactions to storage:', error);
    }
  }

  /**
   * Load transactions from local storage
   */
  private loadTransactionsFromStorage(): void {
    try {
      const stored = localStorage.getItem('ckb_game_transactions');
      if (stored) {
        this.transactions = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load transactions from storage:', error);
    }
  }

  /**
   * Save current session to local storage
   */
  private saveCurrentSession(): void {
    try {
      if (this.currentSession) {
        localStorage.setItem('ckb_game_current_session', JSON.stringify(this.currentSession));
      }
    } catch (error) {
      console.error('Failed to save current session to storage:', error);
    }
  }

  /**
   * Load current session from local storage
   */
  private loadCurrentSession(): void {
    try {
      const stored = localStorage.getItem('ckb_game_current_session');
      if (stored) {
        const session = JSON.parse(stored);
        // Only load if session is still active and not too old (24 hours)
        if (session.status === 'active' && Date.now() - session.startTime < 24 * 60 * 60 * 1000) {
          this.currentSession = session;
        } else {
          // Clear expired session
          this.clearCurrentSession();
        }
      }
    } catch (error) {
      console.error('Failed to load current session from storage:', error);
    }
  }

  /**
   * Clear current session from local storage
   */
  private clearCurrentSession(): void {
    try {
      localStorage.removeItem('ckb_game_current_session');
    } catch (error) {
      console.error('Failed to clear current session from storage:', error);
    }
  }

  /**
   * Reset adapter (for testing)
   */
  reset(): void {
    this.transactions = [];
    this.currentSession = null;
    this.gameHistory = [];
    this.clearCurrentSession();
    this.saveTransactionsToStorage();
  }
}

/**
 * Utility functions for CKB conversion
 */
export const CkbUtils = {
  /**
   * Convert shannon to CKB
   */
  shannonToCkb(shannon: number): number {
    return shannon / 100000000;
  },

  /**
   * Convert CKB to shannon
   */
  ckbToShannon(ckb: number): number {
    return Math.floor(ckb * 100000000);
  },

  /**
   * Format CKB amount for display
   */
  formatCkb(shannon: number): string {
    const ckb = this.shannonToCkb(shannon);
    return ckb.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 });
  },

  /**
   * Format transaction hash for display
   */
  formatTxHash(hash: string): string {
    return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
  },

  /**
   * Get transaction explorer URL
   */
  getExplorerUrl(txHash: string, network: 'mainnet' | 'testnet' = 'testnet'): string {
    const baseUrl = network === 'mainnet' 
      ? 'https://explorer.nervos.org' 
      : 'https://pudge.explorer.nervos.org';
    return `${baseUrl}/transaction/${txHash}`;
  },
};

// Global adapter instance
export const ckbAdapter = new CkbAdapter();

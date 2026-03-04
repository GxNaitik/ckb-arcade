/**
 * Mock CKB Wallet Adapter
 * Simulates CKB blockchain interactions for development/testing
 */

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

/**
 * Mock CKB Adapter - Simulates blockchain interactions
 */
export class MockCkbAdapter {
  private balance: CkbBalance;
  private transactions: TransactionResult[];
  private currentSession: GameSession | null;
  private gameHistory: GameSession[];
  private readonly ENTRY_FEE = 199 * 100000000; // 199 CKB in shannon

  constructor(initialBalance: number = 1000 * 100000000) { // Default 1000 CKB
    this.balance = {
      available: initialBalance,
      locked: 0,
      total: initialBalance,
    };
    this.transactions = [];
    this.currentSession = null;
    this.gameHistory = [];
  }

  /**
   * Get current wallet balance
   */
  getBalance(): CkbBalance {
    return { ...this.balance };
  }

  /**
   * Check if player can afford entry fee
   */
  canAffordEntry(): boolean {
    return this.balance.available >= this.ENTRY_FEE;
  }

  /**
   * Get entry fee amount
   */
  getEntryFee(): number {
    return this.ENTRY_FEE;
  }

  /**
   * Start a new game session (deduct entry fee)
   */
  async startGameSession(): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    if (!this.canAffordEntry()) {
      return {
        success: false,
        error: `Insufficient balance. Need ${this.ENTRY_FEE / 100000000} CKB, have ${this.balance.available / 100000000} CKB`
      };
    }

    if (this.currentSession && this.currentSession.status === 'active') {
      return {
        success: false,
        error: 'Game session already active'
      };
    }

    // Deduct entry fee
    this.balance.available -= this.ENTRY_FEE;
    this.balance.locked += this.ENTRY_FEE;

    // Create transaction record
    const transaction: TransactionResult = {
      hash: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending',
      fee: Math.floor(this.ENTRY_FEE * 0.001), // 0.1% fee
      timestamp: Date.now(),
    };
    this.transactions.push(transaction);

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

    // Simulate transaction confirmation
    setTimeout(() => {
      transaction.status = 'confirmed';
      this.balance.locked -= this.ENTRY_FEE;
    }, 1000);

    return {
      success: true,
      sessionId,
    };
  }

  /**
   * Update coin collection during game
   */
  updateCoinCollection(coinsCollected: number): void {
    if (this.currentSession && this.currentSession.status === 'active') {
      this.currentSession.coinsCollected = coinsCollected;
      this.currentSession.profit = (coinsCollected * 10 * 100000000) - this.currentSession.entryFee; // 10 CKB per coin
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

    this.currentSession.endTime = Date.now();
    this.currentSession.status = won ? 'completed' : 'failed';

    if (won) {
      // Player wins - add winnings (400 CKB reward)
      const winnings = 400 * 100000000; // 400 CKB in shannon
      this.balance.available += winnings;
      this.currentSession.profit += winnings;

      // Create winning transaction
      const transaction: TransactionResult = {
        hash: `win_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        status: 'confirmed',
        fee: 0,
        timestamp: Date.now(),
      };
      this.transactions.push(transaction);
    }

    // Move session to history
    this.gameHistory.push({ ...this.currentSession });
    const completedSession = { ...this.currentSession };
    this.currentSession = null;

    return {
      success: true,
      result: completedSession,
    };
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
   * Add funds to wallet (for testing)
   */
  addFunds(amount: number): void {
    this.balance.available += amount;
    this.balance.total += amount;
  }

  /**
   * Reset wallet (for testing)
   */
  reset(): void {
    this.balance = {
      available: 1000 * 100000000,
      locked: 0,
      total: 1000 * 100000000,
    };
    this.transactions = [];
    this.currentSession = null;
    this.gameHistory = [];
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
};

// Global mock adapter instance
export const mockCkbAdapter = new MockCkbAdapter();

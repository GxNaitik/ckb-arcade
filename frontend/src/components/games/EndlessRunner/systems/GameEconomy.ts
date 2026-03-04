/**
 * Game Economy Manager
 * Handles all economic aspects of the CKB Arcade game
 */

import { ccc } from '@ckb-ccc/connector-react';
import { CkbAdapter, GameSession, CkbUtils } from './CkbAdapter';

// Survival Reward Tiers (time in seconds)
export const SURVIVAL_REWARD_TIERS = {
  TIER_1: { time: 60, reward: 100 },      // 1 minute = 100 CKB
  TIER_2: { time: 300, reward: 500 },     // 5 minutes = 500 CKB
  TIER_3: { time: 600, reward: 1000 },    // 10 minutes = 1000 CKB
} as const;

export interface EconomyState {
  canPlay: boolean;
  currentBalance: number;
  entryFee: number;
  currentSession: GameSession | null;
  isProcessing: boolean;
  lastError: string | null;
  pendingReward: PendingReward | null;
}

export interface PendingReward {
  sessionId: string;
  survivalTime: number;
  rewardTier: number;
  rewardAmount: number;
  status: 'pending' | 'verified' | 'claimed' | 'failed';
  serverVerified: boolean;
}

export interface GameEconomics {
  entryFeeCkb: number;
  rewardCkb: number;
  coinValueCkb: number;
  maxWinRate: number;
  antiCheatEnabled: boolean;
  maxDailySessions: number; // Anti-bot: max 5 paid sessions per day
  maxRewardPerSession: number; // Cap at 1000 CKB
}

/**
 * Game Economy Manager
 */
export class GameEconomy {
  private ckbAdapter: CkbAdapter;
  private economics: GameEconomics;
  private listeners: Set<(state: EconomyState) => void> = new Set();

  constructor(gameContractAddress?: string) {
    this.ckbAdapter = new CkbAdapter(gameContractAddress);
    this.economics = {
      entryFeeCkb: 200,
      rewardCkb: 400,
      coinValueCkb: 10,
      maxWinRate: 45,
      antiCheatEnabled: true,
      maxDailySessions: 5,
      maxRewardPerSession: 1000,
    };
  }

  /**
   * Initialize with signer
   */
  async initialize(signer: ccc.Signer): Promise<void> {
    await this.ckbAdapter.initialize(signer);
    this.notifyListeners();
  }

  /**
   * Add state change listener
   */
  addListener(listener: (state: EconomyState) => void): void {
    this.listeners.add(listener);
  }

  /**
   * Remove state change listener
   */
  removeListener(listener: (state: EconomyState) => void): void {
    this.listeners.delete(listener);
  }

  /**
   * Notify listeners of state change
   */
  private async notifyListeners(): Promise<void> {
    const state = await this.getCurrentState();
    this.listeners.forEach(listener => listener(state));
  }

  /**
   * Get current economy state
   */
  async getCurrentState(): Promise<EconomyState> {
    const balance = await this.ckbAdapter.getBalance();
    const transactionState = this.ckbAdapter.getTransactionState();
    
    return {
      canPlay: await this.ckbAdapter.canAffordEntry(),
      currentBalance: balance.available,
      entryFee: this.ckbAdapter.getEntryFee(),
      currentSession: this.ckbAdapter.getCurrentSession(),
      isProcessing: transactionState.isProcessing,
      lastError: transactionState.lastError,
      pendingReward: null, // Will be populated when reward is pending
    };
  }

  /**
   * Start game session (pay entry fee)
   */
  async startGame(): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    try {
      if (!(await this.ckbAdapter.canAffordEntry())) {
        const balance = await this.ckbAdapter.getBalance();
        return {
          success: false,
          error: `Insufficient balance. Need ${this.economics.entryFeeCkb / 100000000} CKB, have ${balance.available / 100000000} CKB`
        };
      }

      const currentSession = this.ckbAdapter.getCurrentSession();
      if (currentSession && currentSession.status === 'active') {
        return {
          success: false,
          error: 'Game session already active'
        };
      }

      // Start game session with real CKB transaction
      const result = await this.ckbAdapter.startGameSession();
      
      if (!result.success) {
        return result;
      }

      // Initialize session tracker if anti-cheat is enabled
      if (this.economics.antiCheatEnabled && result.sessionId) {
        // TODO: Implement session tracking when anti-cheat is fully integrated
        console.log('Session tracking enabled for:', result.sessionId);
      }

      this.notifyListeners();
      return result;
    } catch (error) {
      console.error('Failed to start game:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start game'
      };
    }
  }

  /**
   * Update coin collection during gameplay
   */
  updateCoinCollection(coinsCollected: number): void {
    this.ckbAdapter.updateCoinCollection(coinsCollected);
    // Use async notify for performance during gameplay
    this.notifyListeners().catch(console.error);
  }

  /**
   * Complete game session
   */
  async completeGame(won: boolean, coinsCollected: number): Promise<{ 
    success: boolean; 
    summary?: GameSummary;
    error?: string;
  }> {
    // Update final coin count
    this.ckbAdapter.updateCoinCollection(coinsCollected);

    try {
      const result = await this.ckbAdapter.completeGameSession(won);
      
      if (!result.success) {
        return { success: false, error: result.error };
      }

      const summary = this.generateGameSummary(result.result!);
      this.notifyListeners();
      
      return { success: true, summary };
    } catch (error) {
      return { success: false, error: 'Failed to complete game' };
    }
  }

  /**
   * Generate game summary for UI display
   */
  private generateGameSummary(session: GameSession): GameSummary {
    const entryFeeCkb = CkbUtils.shannonToCkb(session.entryFee);
    const coinsValueCkb = session.coinsCollected * this.economics.coinValueCkb;
    const rewardCkb = session.status === 'completed' ? this.economics.rewardCkb : 0;
    const totalEarnedCkb = coinsValueCkb + rewardCkb;
    const netProfitCkb = totalEarnedCkb - entryFeeCkb;

    return {
      sessionId: session.id,
      won: session.status === 'completed',
      duration: session.endTime ? session.endTime - session.startTime : 0,
      entryFee: entryFeeCkb,
      coinsCollected: session.coinsCollected,
      coinsValue: coinsValueCkb,
      reward: rewardCkb,
      totalEarned: totalEarnedCkb,
      netProfit: netProfitCkb,
      profitPercentage: entryFeeCkb > 0 ? (netProfitCkb / entryFeeCkb) * 100 : 0,
    };
  }

  /**
   * Get game statistics
   */
  async getStatistics(): Promise<GameStatistics> {
    const stats = this.ckbAdapter.getGameStats();
    const balance = await this.ckbAdapter.getBalance();

    return {
      totalGames: stats.totalGames,
      gamesWon: stats.gamesWon,
      gamesLost: stats.gamesLost,
      winRate: stats.winRate,
      totalSpent: CkbUtils.shannonToCkb(stats.totalSpent),
      totalEarned: CkbUtils.shannonToCkb(stats.totalEarned),
      netProfit: CkbUtils.shannonToCkb(stats.netProfit),
      currentBalance: CkbUtils.shannonToCkb(balance.available),
      averageProfit: stats.totalGames > 0 ? CkbUtils.shannonToCkb(stats.netProfit) / stats.totalGames : 0,
    };
  }

  /**
   * Get transaction history
   */
  getTransactionHistory(): TransactionHistory[] {
    const transactions = this.ckbAdapter.getTransactionHistory();
    const sessions = this.ckbAdapter.getGameHistory();

    return transactions.map(tx => ({
      hash: tx.hash,
      type: tx.hash.startsWith('win_') ? 'reward' : 'entry_fee',
      amount: tx.hash.startsWith('win_') ? this.economics.rewardCkb : this.economics.entryFeeCkb,
      status: tx.status,
      timestamp: tx.timestamp,
      fee: CkbUtils.shannonToCkb(tx.fee),
      gameId: sessions.find(s => tx.hash.includes(s.id))?.id,
    }));
  }

  /**
   * Check if player can afford entry
   */
  async canAffordEntry(): Promise<boolean> {
    return await this.ckbAdapter.canAffordEntry();
  }

  /**
   * Get entry fee in CKB
   */
  getEntryFee(): number {
    return this.economics.entryFeeCkb;
  }

  /**
   * Add funds (for testing)
   */
  addFunds(): void {
    // Note: Real CKB adapter doesn't support adding funds
    // This is kept for testing compatibility only
    console.warn('addFunds not supported in real CKB adapter');
    this.notifyListeners().catch(console.error);
  }

  /**
   * Reset economy (for testing)
   */
  reset(): void {
    this.ckbAdapter.reset();
    this.notifyListeners().catch(console.error);
  }

  /**
   * Force clear stuck session
   */
  forceResetSession(): void {
    this.ckbAdapter.reset();
    this.notifyListeners().catch(console.error);
  }

  /**
   * Calculate reward tier based on survival time (client-side for display only)
   * Server will recompute this - DO NOT trust client values
   */
  calculateRewardTier(survivalTime: number): number {
    if (survivalTime >= SURVIVAL_REWARD_TIERS.TIER_3.time) return 3;
    if (survivalTime >= SURVIVAL_REWARD_TIERS.TIER_2.time) return 2;
    if (survivalTime >= SURVIVAL_REWARD_TIERS.TIER_1.time) return 1;
    return 0;
  }

  /**
   * Get reward amount for tier (client-side for display only)
   */
  getRewardForTier(tier: number): number {
    switch (tier) {
      case 3: return SURVIVAL_REWARD_TIERS.TIER_3.reward;
      case 2: return SURVIVAL_REWARD_TIERS.TIER_2.reward;
      case 1: return SURVIVAL_REWARD_TIERS.TIER_1.reward;
      default: return 0;
    }
  }

  /**
   * Request reward verification from server
   * ONLY sends survivalTime - server computes tier to prevent manipulation
   * 
   * Security flow:
   * 1. Client sends: sessionId, walletAddress, survivalTime
   * 2. Server validates: session exists, not duplicate, time reasonable (< 1hr)
   * 3. Server computes: tier based on survivalTime (not client-provided tier)
   * 4. Server marks: session as claimed
   * 5. Server triggers: CKB payout from treasury
   */
  async requestRewardVerification(
    sessionId: string, 
    survivalTime: number
  ): Promise<{ 
    success: boolean; 
    pendingReward?: PendingReward;
    error?: string;
  }> {
    try {
      // Validate inputs
      if (!sessionId || survivalTime <= 0) {
        return { success: false, error: 'Invalid session or survival time' };
      }

      // Anti-cheat: Max reasonable survival time (1 hour = 3600 seconds)
      if (survivalTime > 3600) {
        return { success: false, error: 'Survival time exceeds maximum allowed' };
      }

      // Client-side tier calculation (for display only - server will recompute)
      const rewardTier = this.calculateRewardTier(survivalTime);

      // If no reward tier achieved, no need to verify
      if (rewardTier === 0) {
        return { 
          success: true, 
          pendingReward: {
            sessionId,
            survivalTime,
            rewardTier: 0,
            rewardAmount: 0,
            status: 'claimed', // No reward to claim
            serverVerified: true,
          }
        };
      }

      // Get wallet address for verification
      const walletAddress = await this.ckbAdapter.getWalletAddress();
      if (!walletAddress) {
        return { success: false, error: 'Wallet not connected' };
      }

      // TODO: Replace with actual backend endpoint
      // For now, simulate server verification
      const serverResponse = await this.verifyWithServer({
        sessionId,
        walletAddress,
        survivalTime, // ONLY send time - server computes tier
      });

      if (!serverResponse.verified) {
        return { success: false, error: serverResponse.error || 'Server verification failed' };
      }

      // Create pending reward
      const pendingReward: PendingReward = {
        sessionId,
        survivalTime,
        rewardTier: serverResponse.rewardTier ?? 0, // Use server-computed tier with fallback
        rewardAmount: serverResponse.rewardAmount ?? 0, // Use server-computed amount with fallback
        status: 'verified',
        serverVerified: true,
      };

      // Distribute the reward
      const distributionResult = await this.distributeSurvivalReward(
        walletAddress,
        pendingReward.rewardAmount,
        sessionId
      );

      if (distributionResult.success) {
        pendingReward.status = 'claimed';
      } else {
        pendingReward.status = 'failed';
        return { success: false, error: distributionResult.error };
      }

      this.notifyListeners();
      return { success: true, pendingReward };

    } catch (error) {
      console.error('Reward verification failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Reward verification failed' 
      };
    }
  }

  /**
   * Verify survival with server
   * This is a mock implementation - replace with actual API call
   */
  private async verifyWithServer(params: {
    sessionId: string;
    walletAddress: string;
    survivalTime: number;
  }): Promise<{ 
    verified: boolean; 
    rewardTier?: number;
    rewardAmount?: number;
    error?: string;
  }> {
    // TODO: Replace with actual API call to backend
    // POST /api/verify-survival
    // {
    //   sessionId: params.sessionId,
    //   walletAddress: params.walletAddress,
    //   survivalTime: params.survivalTime
    // }

    // Mock server-side tier calculation (server does this, not client)
    let rewardTier = 0;
    let rewardAmount = 0;

    if (params.survivalTime >= SURVIVAL_REWARD_TIERS.TIER_3.time) {
      rewardTier = 3;
      rewardAmount = SURVIVAL_REWARD_TIERS.TIER_3.reward;
    } else if (params.survivalTime >= SURVIVAL_REWARD_TIERS.TIER_2.time) {
      rewardTier = 2;
      rewardAmount = SURVIVAL_REWARD_TIERS.TIER_2.reward;
    } else if (params.survivalTime >= SURVIVAL_REWARD_TIERS.TIER_1.time) {
      rewardTier = 1;
      rewardAmount = SURVIVAL_REWARD_TIERS.TIER_1.reward;
    }

    // Simulate server validation
    await new Promise(resolve => setTimeout(resolve, 500));

    return {
      verified: true,
      rewardTier,
      rewardAmount,
    };
  }

  /**
   * Distribute survival reward from treasury wallet
   * This initiates the on-chain CKB transfer
   */
  private async distributeSurvivalReward(
    address: string,
    amount: number,
    sessionId: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      if (amount <= 0) {
        return { success: true }; // No reward to distribute
      }

      // TODO: Implement actual CKB transfer from treasury wallet
      // This requires:
      // 1. Treasury wallet with sufficient CKB balance
      // 2. Build CKB transfer transaction
      // 3. Sign with treasury wallet
      // 4. Submit to CKB network
      // 5. Return txHash

      console.log(`[Distribute Reward] ${amount} CKB to ${address} for session ${sessionId}`);

      // Mock successful distribution
      // In production, this would be a real CKB transaction
      const mockTxHash = `reward_${sessionId}_${Date.now()}`;

      return { success: true, txHash: mockTxHash };
    } catch (error) {
      console.error('Failed to distribute reward:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to distribute reward' 
      };
    }
  }

  /**
   * Check if user has reached daily session limit (anti-bot)
   */
  async canStartNewSession(): Promise<{ allowed: boolean; reason?: string }> {
    // TODO: Check daily session count from server
    // For now, always allow
    return { allowed: true };
  }
}

/**
 * Type definitions for UI
 */
export interface GameSummary {
  sessionId: string;
  won: boolean;
  duration: number;
  entryFee: number;
  coinsCollected: number;
  coinsValue: number;
  reward: number;
  totalEarned: number;
  netProfit: number;
  profitPercentage: number;
}

export interface GameStatistics {
  totalGames: number;
  gamesWon: number;
  gamesLost: number;
  winRate: number;
  totalSpent: number;
  totalEarned: number;
  netProfit: number;
  currentBalance: number;
  averageProfit: number;
}

export interface TransactionHistory {
  hash: string;
  type: 'entry_fee' | 'reward';
  amount: number;
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: number;
  fee: number;
  gameId?: string;
}

// Global economy manager factory
export const createGameEconomy = (gameContractAddress?: string) => new GameEconomy(gameContractAddress);

// Default instance for backward compatibility
export const gameEconomy = new GameEconomy();

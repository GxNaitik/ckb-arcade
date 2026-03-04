/**
 * React Hook for Game Economy
 * Provides easy integration with CKB game economy
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ccc } from '@ckb-ccc/connector-react';
import { gameEconomy, createGameEconomy, EconomyState, GameSummary, GameStatistics, TransactionHistory } from './GameEconomy';

/**
 * Hook return type
 */
export interface UseGameEconomyReturn {
  // State
  canPlay: boolean;
  currentBalance: number;
  entryFee: number;
  isProcessing: boolean;
  lastError: string | null;

  // Actions
  startGame: () => Promise<{ success: boolean; sessionId?: string; error?: string }>;
  updateCoinCollection: (coins: number) => void;
  completeGame: (won: boolean, coinsCollected: number) => Promise<{ success: boolean; summary?: GameSummary; error?: string }>;

  // Data
  getStatistics: () => Promise<GameStatistics>;
  getTransactionHistory: () => TransactionHistory[];

  // Utilities
  formatBalance: (balance: number) => string;
  formatCkb: (amount: number) => string;

  // Testing
  addFunds: () => void;
  reset: () => void;
  forceResetSession: () => void;
}

/**
 * Game Economy React Hook
 */
export const useGameEconomy = (gameAddress?: string, signer?: ReturnType<typeof ccc.useSigner> | null): UseGameEconomyReturn => {
  const [state, setState] = useState<EconomyState>({
    canPlay: false,
    currentBalance: 0,
    entryFee: 200 * 100000000,
    currentSession: null,
    isProcessing: false,
    lastError: null,
    pendingReward: null,
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  // Create economy manager instance with game address
  const economyManager = useMemo(() => {
    return gameAddress ? createGameEconomy(gameAddress) : gameEconomy;
  }, [gameAddress]);

  // Initialize with signer when available
  useEffect(() => {
    if (signer) {
      economyManager.initialize(signer).catch(console.error);
    }
  }, [signer, economyManager]);

  // Update state when economy manager notifies changes
  useEffect(() => {
    const updateState = async (newState: EconomyState) => {
      setState(newState);
    };

    economyManager.addListener(updateState);

    // Initial state
    economyManager.getCurrentState().then(setState).catch(console.error);

    return () => {
      economyManager.removeListener(updateState);
    };
  }, [economyManager]);

  // Start game session
  const startGame = useCallback(async () => {
    return await economyManager.startGame();
  }, [economyManager]);

  // Update coin collection during game
  const updateCoinCollection = useCallback((coins: number) => {
    economyManager.updateCoinCollection(coins);
  }, [economyManager]);

  // Complete game session
  const completeGame = useCallback(async (won: boolean, coinsCollected: number) => {
    return await economyManager.completeGame(won, coinsCollected);
  }, [economyManager]);

  // Get statistics
  const getStatistics = useCallback(async () => {
    return await economyManager.getStatistics();
  }, [economyManager]);

  // Get transaction history
  const getTransactionHistory = useCallback(() => {
    return economyManager.getTransactionHistory();
  }, [economyManager]);

  // Format balance for display
  const formatBalance = useCallback((balance: number) => {
    return `${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })} CKB`;
  }, []);

  // Format CKB amount
  const formatCkb = useCallback((amount: number) => {
    return `${amount.toLocaleString()} CKB`;
  }, []);

  // Add funds (testing)
  const addFunds = useCallback(() => {
    economyManager.addFunds();
  }, [economyManager]);

  // Reset economy (testing)
  const reset = useCallback(() => {
    economyManager.reset();
  }, [economyManager]);

  // Force reset stuck session
  const forceResetSession = useCallback(() => {
    economyManager.forceResetSession();
  }, [economyManager]);

  return {
    // State
    canPlay: state.canPlay,
    currentBalance: state.currentBalance / 100000000, // Convert to CKB
    entryFee: state.entryFee / 100000000, // Convert to CKB
    isProcessing: state.isProcessing,
    lastError: state.lastError,

    // Actions
    startGame,
    updateCoinCollection,
    completeGame,

    // Data
    getStatistics,
    getTransactionHistory,

    // Utilities
    formatBalance,
    formatCkb,

    // Testing
    addFunds,
    reset,
    forceResetSession,
  };
};

/**
 * Hook for game session management
 */
export const useGameSession = () => {
  const [sessionSummary, setSessionSummary] = useState<GameSummary | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const { completeGame } = useGameEconomy();

  // Start new session
  const startSession = useCallback(() => {
    setSessionSummary(null);
    setShowSummary(false);
  }, []);

  // End session and show summary
  const endSession = useCallback(async (won: boolean, coinsCollected: number) => {
    const result = await completeGame(won, coinsCollected);

    if (result.success && result.summary) {
      setSessionSummary(result.summary);
      setShowSummary(true);
    }

    return result;
  }, [completeGame]);

  // Hide summary
  const hideSummary = useCallback(() => {
    setShowSummary(false);
  }, []);

  return {
    sessionSummary,
    showSummary,
    startSession,
    endSession,
    hideSummary,
  };
};

/**
 * Hook for economy statistics
 */
export const useEconomyStatistics = () => {
  const [stats, setStats] = useState<GameStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const { getStatistics } = useGameEconomy();

  // Refresh statistics
  const refreshStats = useCallback(async () => {
    try {
      setLoading(true);
      const newStats = await getStatistics();
      setStats(newStats);
    } catch (error) {
      console.error('Failed to refresh statistics:', error);
    } finally {
      setLoading(false);
    }
  }, [getStatistics]);

  // Initial load and auto-refresh every 5 seconds
  useEffect(() => {
    refreshStats();
    const interval = setInterval(refreshStats, 5000);
    return () => clearInterval(interval);
  }, [refreshStats]);

  return {
    stats,
    loading,
    refreshStats,
  };
};

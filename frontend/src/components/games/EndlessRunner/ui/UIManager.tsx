/**
 * UI Manager Component
 * Orchestrates all UI screens and manages state flow
 */

import React, { useState, useCallback, useEffect } from 'react';
import { StartScreen } from './StartScreen';
import { WalletConnectScreen } from './WalletConnectScreen';
import { EntryConfirmationScreen } from './EntryConfirmationScreen';
import { InGameHUD } from './InGameHUD';
import { GameOverSummary } from './GameOverSummary';

// UI States
type UIState =
  | 'start'
  | 'wallet-connect'
  | 'entry-confirmation'
  | 'playing'
  | 'paused'
  | 'game-over'
  | 'loading';

// UI State Data
interface UIData {
  walletConnected: boolean;
  currentBalance: number;
  isProcessing: boolean;
  error: string | null;
  gameStats: {
    coins: number;
    distance: number;
    speed: number;
    gameTime: number;
  };
  gameResults: {
    won: boolean;
    duration: number;
    entryFee: number;
    coinsCollected: number;
    coinsValue: number;
    reward: number;
    totalEarned: number;
    netProfit: number;
    profitPercentage: number;
    antiCheatViolations?: Array<{
      type: string;
      severity: string;
      penalty: number;
    }>;
  } | null;
}

interface UIManagerProps {
  // Game callbacks
  onGameStart: () => Promise<void>;
  onGamePause: () => void;
  onGameResume: () => void;
  onGameQuit: () => void;
  onWalletConnect: (walletType: string) => Promise<void>;

  // Game state (read-only)
  gameStats: {
    coins: number;
    distance: number;
    speed: number;
    gameTime: number;
  };
  currentBalance: number;
  walletConnected: boolean;
  isProcessing: boolean;
  error: string | null;
}

export const UIManager: React.FC<UIManagerProps> = ({
  onGameStart,
  onGamePause,
  onGameResume,
  onGameQuit,
  onWalletConnect,
  gameStats,
  currentBalance,
  walletConnected,
  isProcessing,
  error,
}) => {
  // UI State Management
  const [uiState, setUiState] = useState<UIState>('start');
  const [uiData, setUiData] = useState<UIData>({
    walletConnected,
    currentBalance,
    isProcessing,
    error,
    gameStats,
    gameResults: null,
  });

  // Update UI data when props change
  useEffect(() => {
    setUiData(prev => ({
      ...prev,
      walletConnected,
      currentBalance,
      isProcessing,
      error,
      gameStats,
    }));
  }, [walletConnected, currentBalance, isProcessing, error, gameStats]);

  // Navigation handlers
  const handleStartGame = useCallback(async () => {
    if (!walletConnected) {
      setUiState('wallet-connect');
      return;
    }

    if (currentBalance < 199) {
      setUiState('entry-confirmation');
      return;
    }

    setUiState('loading');
    try {
      await onGameStart();
      setUiState('playing');
    } catch (error) {
      setUiState('start');
      // Error handled by parent component
    }
  }, [walletConnected, currentBalance, onGameStart]);

  const handleWalletConnect = useCallback(async (walletType: string) => {
    setUiState('loading');
    try {
      await onWalletConnect(walletType);
      setUiState('start');
    } catch (error) {
      setUiState('wallet-connect');
      // Error handled by parent component
    }
  }, [onWalletConnect]);

  const handleConfirmEntry = useCallback(async () => {
    setUiState('loading');
    try {
      await onGameStart();
      setUiState('playing');
    } catch (error) {
      setUiState('entry-confirmation');
      // Error handled by parent component
    }
  }, [onGameStart]);

  const handlePauseGame = useCallback(() => {
    onGamePause();
    setUiState('paused');
  }, [onGamePause]);

  const handleResumeGame = useCallback(() => {
    onGameResume();
    setUiState('playing');
  }, [onGameResume]);

  const handleQuitGame = useCallback(() => {
    onGameQuit();
    setUiState('start');
  }, [onGameQuit]);

  const handlePlayAgain = useCallback(async () => {
    setUiState('loading');
    try {
      await onGameStart();
      setUiState('playing');
    } catch (error) {
      setUiState('start');
      // Error handled by parent component
    }
  }, [onGameStart]);

  // Public method to show game over screen
  const showGameOver = useCallback((results: UIData['gameResults']) => {
    setUiData(prev => ({ ...prev, gameResults: results }));
    setUiState('game-over');
  }, []);

  // Public method to go back to start
  const goToStart = useCallback(() => {
    setUiState('start');
    setUiData(prev => ({ ...prev, gameResults: null }));
  }, []);

  // Expose methods to parent component
  React.useImperativeHandle(React.createRef(), () => ({
    showGameOver,
    goToStart,
  }));

  // Render appropriate screen based on state
  const renderScreen = () => {
    switch (uiState) {
      case 'start':
        return (
          <StartScreen
            onStart={handleStartGame}
            onConnect={() => setUiState('wallet-connect')}
            walletConnected={walletConnected}
            currentBalance={currentBalance}
          />
        );

      case 'wallet-connect':
        return (
          <WalletConnectScreen
            onConnect={handleWalletConnect}
            onBack={() => setUiState('start')}
            isConnecting={isProcessing}
            connectionError={error}
          />
        );

      case 'entry-confirmation':
        return (
          <EntryConfirmationScreen
            onConfirm={handleConfirmEntry}
            onCancel={() => setUiState('start')}
            isProcessing={isProcessing}
            currentBalance={currentBalance}
            entryFee={199}
          />
        );

      case 'playing':
        return (
          <InGameHUD
            coins={gameStats.coins}
            distance={gameStats.distance}
            speed={gameStats.speed}
            gameTime={gameStats.gameTime}
            balance={currentBalance}
            isPaused={false}
            onPause={handlePauseGame}
            onResume={handleResumeGame}
            onQuit={handleQuitGame}
          />
        );

      case 'paused':
        return (
          <InGameHUD
            coins={gameStats.coins}
            distance={gameStats.distance}
            speed={gameStats.speed}
            gameTime={gameStats.gameTime}
            balance={currentBalance}
            isPaused={true}
            onPause={handlePauseGame}
            onResume={handleResumeGame}
            onQuit={handleQuitGame}
          />
        );

      case 'game-over':
        if (!uiData.gameResults) return null;
        return (
          <GameOverSummary
            won={uiData.gameResults.won}
            duration={uiData.gameResults.duration}
            entryFee={uiData.gameResults.entryFee}
            coinsCollected={uiData.gameResults.coinsCollected}
            coinsValue={uiData.gameResults.coinsValue}
            reward={uiData.gameResults.reward}
            totalEarned={uiData.gameResults.totalEarned}
            netProfit={uiData.gameResults.netProfit}
            profitPercentage={uiData.gameResults.profitPercentage}
            onPlayAgain={handlePlayAgain}
            onQuit={handleQuitGame}
            antiCheatViolations={uiData.gameResults.antiCheatViolations}
          />
        );

      case 'loading':
        return (
          <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
              <p className="text-white text-lg">Loading...</p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="relative w-full h-full">
      {renderScreen()}
    </div>
  );
};

// Export UI manager hook for easy integration
export const useUIManager = () => {
  const uiManagerRef = React.useRef<any>(null);

  const showGameOver = React.useCallback((results: any) => {
    uiManagerRef.current?.showGameOver(results);
  }, []);

  const goToStart = React.useCallback(() => {
    uiManagerRef.current?.goToStart();
  }, []);

  return {
    uiManagerRef,
    showGameOver,
    goToStart,
  };
};

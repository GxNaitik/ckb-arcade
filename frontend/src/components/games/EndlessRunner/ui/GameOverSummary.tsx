/**
 * Game Over Summary Component
 * Displays detailed game results and rewards
 */

import React, { useEffect } from 'react';

// Sound effects
const playWinSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.setValueAtTime(freq, audioContext.currentTime + i * 0.1);
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime + i * 0.1);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + i * 0.1 + 0.3);
      oscillator.start(audioContext.currentTime + i * 0.1);
      oscillator.stop(audioContext.currentTime + i * 0.1 + 0.3);
    });
  } catch (e) {
    console.log('Audio not supported');
  }
};

const playLossSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(150, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.5);
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (e) {
    console.log('Audio not supported');
  }
};

interface GameOverSummaryProps {
  won: boolean;
  duration: number;
  entryFee: number;
  coinsCollected: number;
  coinsValue: number;
  reward: number;
  totalEarned: number;
  netProfit: number;
  profitPercentage: number;
  onPlayAgain: () => void;
  onQuit: () => void;
  antiCheatViolations?: Array<{
    type: string;
    severity: string;
    penalty: number;
  }>;
}

export const GameOverSummary: React.FC<GameOverSummaryProps> = ({
  won,
  duration,
  entryFee,
  coinsCollected,
  coinsValue,
  reward,
  totalEarned: _totalEarned,
  netProfit,
  profitPercentage,
  onPlayAgain,
  onQuit,
  antiCheatViolations = [],
}) => {
  // Play sound effect on mount
  useEffect(() => {
    if (won) {
      playWinSound();
    } else {
      playLossSound();
    }
  }, [won]);

  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const hasViolations = antiCheatViolations.length > 0;
  const totalPenalty = antiCheatViolations.reduce((sum, v) => sum + v.penalty, 0);

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl max-w-lg w-full p-6 border border-gray-700">
        {/* Victory/Defeat Header */}
        <div className="text-center mb-6">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${won ? 'bg-green-600/20' : 'bg-red-600/20'
            }`}>
            {won ? (
              <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
          <h2 className={`text-3xl font-bold mb-2 ${won ? 'text-green-400' : 'text-red-400'}`}>
            {won ? '🎉 Victory!' : '💀 Game Over'}
          </h2>
          <p className="text-gray-300">
            {won ? 'You survived the urban jungle!' : 'Better luck next time!'}
          </p>
        </div>

        {/* Game Stats */}
        <div className="bg-gray-900/50 rounded-lg p-4 mb-4">
          <h3 className="font-semibold text-white mb-3">Game Statistics</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Duration:</span>
              <span className="text-white">{formatTime(duration)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Coins:</span>
              <span className="text-white">{coinsCollected}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Coin Rate:</span>
              <span className="text-white">
                {(coinsCollected / (duration / 60000)).toFixed(1)}/min
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Status:</span>
              <span className={won ? 'text-green-400' : 'text-red-400'}>
                {won ? 'Winner' : 'Runner Up'}
              </span>
            </div>
          </div>
        </div>

        {/* Financial Summary */}
        <div className="bg-gray-900/50 rounded-lg p-4 mb-4">
          <h3 className="font-semibold text-white mb-3">Financial Summary</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">Entry Fee:</span>
              <span className="text-red-400 font-mono">-{entryFee.toFixed(2)} CKB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Coin Value:</span>
              <span className="text-green-400 font-mono">+{coinsValue.toFixed(2)} CKB</span>
            </div>
            {reward > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400">Victory Reward:</span>
                <span className="text-yellow-400 font-mono">+{reward.toFixed(2)} CKB</span>
              </div>
            )}

            {/* Anti-Cheat Penalties */}
            {hasViolations && (
              <div className="border-t border-gray-700 pt-2">
                <div className="flex justify-between">
                  <span className="text-orange-400">Anti-Cheat Penalty:</span>
                  <span className="text-orange-400 font-mono">-{totalPenalty}%</span>
                </div>
              </div>
            )}

            <div className="border-t border-gray-700 pt-2">
              <div className="flex justify-between">
                <span className="text-white font-semibold">Net Profit:</span>
                <span className={`font-bold font-mono ${netProfit >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                  {netProfit >= 0 ? '+' : ''}{netProfit.toFixed(2)} CKB
                </span>
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-gray-400">Return:</span>
                <span className={profitPercentage >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {profitPercentage >= 0 ? '+' : ''}{profitPercentage.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Anti-Cheat Violations */}
        {hasViolations && (
          <div className="bg-orange-600/10 border border-orange-600/30 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-orange-400 mb-2">⚠️ Fair Play Violations</h3>
            <div className="space-y-1 text-sm">
              {antiCheatViolations.map((violation, index) => (
                <div key={index} className="flex justify-between items-center">
                  <span className="text-gray-300">{violation.type}</span>
                  <span className={`text-xs px-2 py-1 rounded ${violation.severity === 'critical' ? 'bg-red-600/30 text-red-400' :
                      violation.severity === 'high' ? 'bg-orange-600/30 text-orange-400' :
                        'bg-yellow-600/30 text-yellow-400'
                    }`}>
                    {violation.severity} (-{violation.penalty}%)
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Rewards adjusted to maintain fair play. Continued violations may result in stricter penalties.
            </p>
          </div>
        )}

        {/* Achievement Badges */}
        <div className="flex justify-center space-x-2 mb-6">
          {won && (
            <div className="bg-yellow-600/20 border border-yellow-600/30 rounded-full px-3 py-1">
              <span className="text-yellow-400 text-sm font-semibold">🏆 Survivor</span>
            </div>
          )}
          {coinsCollected >= 50 && (
            <div className="bg-green-600/20 border border-green-600/30 rounded-full px-3 py-1">
              <span className="text-green-400 text-sm font-semibold">💰 Coin Collector</span>
            </div>
          )}
          {coinsCollected >= 100 && (
            <div className="bg-purple-600/20 border border-purple-600/30 rounded-full px-3 py-1">
              <span className="text-purple-400 text-sm font-semibold">⭐ Master Collector</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onQuit}
            className="flex-1 px-4 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors font-semibold"
          >
            Quit to Menu
          </button>
          <button
            onClick={onPlayAgain}
            className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
          >
            Play Again
          </button>
        </div>

        {/* Share Results */}
        <div className="mt-4 text-center">
          <button className="text-blue-400 hover:text-blue-300 text-sm underline">
            Share Results
          </button>
        </div>
      </div>
    </div>
  );
};

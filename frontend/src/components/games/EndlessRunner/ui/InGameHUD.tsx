/**
 * In-Game HUD Component
 * Real-time game stats and controls overlay
 */

import React from 'react';

interface InGameHUDProps {
  coins: number;
  distance: number;
  speed: number;
  gameTime: number;
  balance: number;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onQuit: () => void;
}

export const InGameHUD: React.FC<InGameHUDProps> = ({
  coins,
  distance,
  speed,
  gameTime,
  balance,
  isPaused,
  onPause,
  onResume,
  onQuit,
}) => {
  // Format time as MM:SS
  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Calculate progress towards 3-minute goal
  const progressPercentage = Math.min((gameTime / 180000) * 100, 100);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Top Stats Bar */}
      <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-4">
        <div className="flex justify-between items-start max-w-6xl mx-auto">
          {/* Left Stats */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-sm">C</span>
              </div>
              <div>
                <p className="text-white font-bold text-lg">{coins}</p>
                <p className="text-green-400 text-xs">CKB Coins</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <p className="text-white font-bold text-lg">{speed}</p>
                <p className="text-blue-400 text-xs">Speed</p>
              </div>
            </div>
          </div>

          {/* Center Timer */}
          <div className="text-center">
            <div className="bg-black/50 rounded-lg px-4 py-2 backdrop-blur-sm">
              <p className="text-white font-bold text-2xl">{formatTime(gameTime)}</p>
              <p className="text-gray-300 text-xs">Time Remaining</p>
            </div>
            
            {/* Progress Bar */}
            <div className="mt-2 w-48 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-green-400 to-blue-500 transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <p className="text-gray-400 text-xs mt-1">
              {progressPercentage.toFixed(1)}% Complete
            </p>
          </div>

          {/* Right Stats */}
          <div className="space-y-2 text-right">
            <div>
              <p className="text-white font-bold text-lg">{distance}m</p>
              <p className="text-purple-400 text-xs">Distance</p>
            </div>
            
            <div>
              <p className="text-white font-bold text-lg">{balance.toFixed(1)}</p>
              <p className="text-yellow-400 text-xs">Balance (CKB)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Pause Overlay */}
      {isPaused && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-4xl font-bold text-white mb-4">Game Paused</h2>
            <p className="text-gray-300 mb-6">Take a break - your progress is saved</p>
            
            <div className="space-y-3">
              <button
                onClick={onResume}
                className="w-full px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
              >
                Resume Game
              </button>
              <button
                onClick={onQuit}
                className="w-full px-8 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold"
              >
                Quit Game
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Control Hints */}
      <div className="absolute bottom-4 left-4 bg-black/50 rounded-lg p-3 backdrop-blur-sm">
        <p className="text-gray-300 text-xs mb-1">Controls:</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <div className="text-gray-400">← → : Switch lanes</div>
          <div className="text-gray-400">↑ / Space : Jump</div>
          <div className="text-gray-400">↓ : Slide</div>
          <div className="text-gray-400">P : Pause</div>
        </div>
      </div>

      {/* Mobile Controls */}
      <div className="absolute bottom-4 right-4 md:hidden">
        <div className="grid grid-cols-3 gap-2">
          <div></div>
          <button
            onTouchStart={() => {/* Handle jump */}}
            className="w-12 h-12 bg-blue-600/80 rounded-lg flex items-center justify-center"
          >
            ↑
          </button>
          <div></div>
          
          <button
            onTouchStart={() => {/* Handle left */}}
            className="w-12 h-12 bg-blue-600/80 rounded-lg flex items-center justify-center"
          >
            ←
          </button>
          <button
            onTouchStart={() => {/* Handle slide */}}
            className="w-12 h-12 bg-blue-600/80 rounded-lg flex items-center justify-center"
          >
            ↓
          </button>
          <button
            onTouchStart={() => {/* Handle right */}}
            className="w-12 h-12 bg-blue-600/80 rounded-lg flex items-center justify-center"
          >
            →
          </button>
        </div>
      </div>

      {/* Pause Button (Desktop) */}
      <button
        onClick={isPaused ? onResume : onPause}
        className="absolute top-4 right-4 w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center hover:bg-white/30 transition-colors pointer-events-auto"
      >
        {isPaused ? (
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
      </button>

      {/* Victory Progress Indicator */}
      {gameTime >= 150000 && gameTime < 180000 && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-yellow-600/80 rounded-lg px-4 py-2">
          <p className="text-white font-semibold text-sm">🔥 Final Stretch! 30 seconds left!</p>
        </div>
      )}
    </div>
  );
};

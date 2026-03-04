/**
 * Start Screen Component
 * Initial game entry point with branding and options
 */

import React from 'react';

interface StartScreenProps {
  onStart: () => void;
  onConnect: () => void;
  walletConnected: boolean;
  currentBalance: number;
}

export const StartScreen: React.FC<StartScreenProps> = ({
  onStart,
  onConnect,
  walletConnected,
  currentBalance,
}) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white p-4">
      {/* Game Title and Branding */}
      <div className="text-center mb-8">
        <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
          CKB Arcade
        </h1>
        <p className="text-xl text-gray-300 mb-2">Endless Runner</p>
        <p className="text-sm text-gray-400">Collect CKB coins and survive the urban jungle!</p>
      </div>

      {/* Game Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 max-w-4xl">
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 text-center">
          <div className="text-3xl mb-2">🏃‍♂️</div>
          <h3 className="font-semibold mb-1">3-Lane Action</h3>
          <p className="text-sm text-gray-300">Switch lanes to avoid obstacles</p>
        </div>
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 text-center">
          <div className="text-3xl mb-2">💰</div>
          <h3 className="font-semibold mb-1">CKB Coins</h3>
          <p className="text-sm text-gray-300">Collect valuable CKB tokens</p>
        </div>
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 text-center">
          <div className="text-3xl mb-2">🏆</div>
          <h3 className="font-semibold mb-1">Win Big</h3>
          <p className="text-sm text-gray-300">Survive 3 minutes to win 400 CKB</p>
        </div>
      </div>

      {/* Wallet Status */}
      <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mb-6 max-w-md w-full">
        <h2 className="text-xl font-semibold mb-4">Wallet Status</h2>
        
        {!walletConnected ? (
          <div className="text-center">
            <p className="text-gray-300 mb-4">Connect your wallet to start playing</p>
            <button
              onClick={onConnect}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
            >
              Connect Wallet
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-300">Status:</span>
              <span className="text-green-400 font-semibold">Connected</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-300">Balance:</span>
              <span className="font-mono">{currentBalance.toFixed(2)} CKB</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-300">Entry Fee:</span>
              <span className="font-mono text-yellow-400">199 CKB</span>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-3 max-w-md w-full">
        {!walletConnected ? (
          <button
            onClick={onConnect}
            className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all font-bold text-lg shadow-lg"
          >
            Connect Wallet to Play
          </button>
        ) : currentBalance >= 199 ? (
          <button
            onClick={onStart}
            className="px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all font-bold text-lg shadow-lg"
          >
            Start Game (199 CKB)
          </button>
        ) : (
          <div className="text-center">
            <button
              disabled
              className="px-8 py-4 bg-gray-600 text-gray-400 rounded-lg font-bold text-lg cursor-not-allowed opacity-50"
            >
              Insufficient Balance
            </button>
            <p className="text-sm text-gray-400 mt-2">
              You need 199 CKB to play. Current balance: {currentBalance.toFixed(2)} CKB
            </p>
          </div>
        )}
        
        <button
          onClick={() => window.open('/how-to-play', '_blank')}
          className="px-6 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
        >
          How to Play
        </button>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-sm text-gray-400">
        <p>Powered by CKB (Nervos Network)</p>
        <p className="mt-1">Play responsibly • 18+ only</p>
      </div>
    </div>
  );
};

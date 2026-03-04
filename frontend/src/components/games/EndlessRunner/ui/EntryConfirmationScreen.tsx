/**
 * Entry Confirmation Screen Component
 * Confirms 199 CKB entry fee before starting game
 */

import React from 'react';

interface EntryConfirmationScreenProps {
  onConfirm: () => void;
  onCancel: () => void;
  isProcessing: boolean;
  currentBalance: number;
  entryFee: number;
}

export const EntryConfirmationScreen: React.FC<EntryConfirmationScreenProps> = ({
  onConfirm,
  onCancel,
  isProcessing,
  currentBalance,
  entryFee,
}) => {
  const remainingBalance = currentBalance - entryFee;
  const canAfford = currentBalance >= entryFee;

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl max-w-md w-full p-6 border border-gray-700">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Entry Fee Confirmation</h2>
          <p className="text-gray-300">Confirm your entry to start the game</p>
        </div>

        {/* Transaction Details */}
        <div className="bg-gray-900/50 rounded-lg p-4 mb-6 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Entry Fee:</span>
            <span className="text-red-400 font-semibold">{entryFee.toFixed(2)} CKB</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Current Balance:</span>
            <span className="text-white font-mono">{currentBalance.toFixed(2)} CKB</span>
          </div>
          <div className="border-t border-gray-700 pt-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Remaining After Entry:</span>
              <span className={`font-semibold ${remainingBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {remainingBalance.toFixed(2)} CKB
              </span>
            </div>
          </div>
        </div>

        {/* Game Rules */}
        <div className="bg-blue-600/10 border border-blue-600/30 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-400 mb-2">Game Rules</h3>
          <ul className="text-sm text-gray-300 space-y-1">
            <li>• Survive for 3 minutes to win 400 CKB</li>
            <li>• Collect coins for additional CKB rewards</li>
            <li>• Avoid obstacles to stay in the game</li>
            <li>• Entry fee is non-refundable once game starts</li>
          </ul>
        </div>

        {/* Warning for insufficient balance */}
        {!canAfford && (
          <div className="bg-red-600/10 border border-red-600/30 rounded-lg p-4 mb-6">
            <p className="text-red-400 text-sm">
              <strong>Insufficient Balance:</strong> You need {entryFee.toFixed(2)} CKB to play. 
              Your current balance is {currentBalance.toFixed(2)} CKB.
            </p>
          </div>
        )}

        {/* Processing State */}
        {isProcessing && (
          <div className="text-center mb-6">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-3"></div>
            <p className="text-blue-300">Processing transaction...</p>
            <p className="text-sm text-gray-400 mt-1">Please wait while we confirm your entry</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="flex-1 px-4 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canAfford || isProcessing}
            className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? 'Processing...' : 'Confirm Entry'}
          </button>
        </div>

        {/* Transaction Fee Notice */}
        <div className="mt-4 text-center text-xs text-gray-400">
          <p>Network fees may apply. Transaction is irreversible once confirmed.</p>
        </div>
      </div>
    </div>
  );
};

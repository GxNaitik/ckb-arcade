/**
 * Wallet Connect Screen Component
 * Handles wallet connection process
 */

import React from 'react';

interface WalletConnectScreenProps {
  onConnect: (walletType: string) => void;
  onBack: () => void;
  isConnecting: boolean;
  connectionError: string | null;
}

export const WalletConnectScreen: React.FC<WalletConnectScreenProps> = ({
  onConnect,
  onBack,
  isConnecting,
  connectionError,
}) => {
  const walletOptions = [
    {
      id: 'ckb-wallet',
      name: 'CKB Wallet',
      description: 'Official CKB desktop wallet',
      icon: '🦉',
      recommended: true,
    },
    {
      id: 'metamask-ckb',
      name: 'MetaMask + CKB',
      description: 'MetaMask with CKB network',
      icon: '🦊',
      recommended: false,
    },
    {
      id: 'joyid',
      name: 'JoyID',
      description: 'Mobile-friendly CKB wallet',
      icon: '📱',
      recommended: false,
    },
    {
      id: 'spore',
      name: 'Spore Wallet',
      description: 'NFT-focused CKB wallet',
      icon: '🍄',
      recommended: false,
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white p-4">
      {/* Header */}
      <div className="text-center mb-8">
        <button
          onClick={onBack}
          className="mb-4 px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
        >
          ← Back
        </button>
        <h1 className="text-4xl font-bold mb-4">Connect Wallet</h1>
        <p className="text-gray-300">Choose your preferred wallet to continue</p>
      </div>

      {/* Connection Status */}
      {isConnecting && (
        <div className="w-full max-w-md mb-6">
          <div className="bg-blue-600/20 border border-blue-400 rounded-lg p-4 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-3"></div>
            <p className="text-blue-300">Connecting to wallet...</p>
            <p className="text-sm text-gray-400 mt-1">Please approve the connection in your wallet</p>
          </div>
        </div>
      )}

      {/* Connection Error */}
      {connectionError && (
        <div className="w-full max-w-md mb-6">
          <div className="bg-red-600/20 border border-red-400 rounded-lg p-4">
            <p className="text-red-300 font-semibold">Connection Failed</p>
            <p className="text-sm text-gray-300 mt-1">{connectionError}</p>
          </div>
        </div>
      )}

      {/* Wallet Options */}
      <div className="w-full max-w-md space-y-3">
        {walletOptions.map((wallet) => (
          <button
            key={wallet.id}
            onClick={() => onConnect(wallet.id)}
            disabled={isConnecting}
            className={`w-full p-4 rounded-lg border transition-all ${
              wallet.recommended
                ? 'bg-green-600/20 border-green-400 hover:bg-green-600/30'
                : 'bg-white/10 border-white/20 hover:bg-white/20'
            } ${isConnecting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="text-2xl">{wallet.icon}</div>
                <div className="text-left">
                  <div className="flex items-center space-x-2">
                    <h3 className="font-semibold">{wallet.name}</h3>
                    {wallet.recommended && (
                      <span className="px-2 py-1 bg-green-500 text-white text-xs rounded-full">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-300">{wallet.description}</p>
                </div>
              </div>
              <div className="text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Help Section */}
      <div className="mt-8 w-full max-w-md">
        <div className="bg-white/5 rounded-lg p-4">
          <h3 className="font-semibold mb-2 text-sm">Need Help?</h3>
          <ul className="text-sm text-gray-300 space-y-1">
            <li>• Make sure your wallet is installed and unlocked</li>
            <li>• Ensure you have sufficient CKB balance</li>
            <li>• Approve the connection request in your wallet</li>
            <li>• Contact support if issues persist</li>
          </ul>
        </div>
      </div>

      {/* Security Notice */}
      <div className="mt-6 text-center text-xs text-gray-400 max-w-md">
        <p>
          <strong>Security Notice:</strong> Never share your private keys or seed phrase. 
          Only connect to trusted applications.
        </p>
      </div>
    </div>
  );
};

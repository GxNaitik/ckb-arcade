/**
 * Transaction Status UI Component
 * Shows real-time transaction states and provides explorer links
 */

import React from 'react';
import { CkbUtils } from '../systems/CkbAdapter';

interface TransactionStatusProps {
  transactions: Array<{
    hash: string;
    type: 'entry_fee' | 'reward' | 'coin_collection';
    amount: number;
    status: 'pending' | 'confirmed' | 'failed';
    timestamp: number;
    fee: number;
    gameId?: string;
  }>;
  network?: 'mainnet' | 'testnet';
}

export const TransactionStatus: React.FC<TransactionStatusProps> = ({ 
  transactions, 
  network = 'testnet' 
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-400';
      case 'confirmed': return 'text-green-400';
      case 'failed': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'confirmed': return '✅';
      case 'failed': return '❌';
      default: return '❓';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'entry_fee': return 'Entry Fee';
      case 'reward': return 'Reward';
      case 'coin_collection': return 'Coin Collection';
      default: return 'Unknown';
    }
  };

  const openExplorer = (txHash: string) => {
    window.open(CkbUtils.getExplorerUrl(txHash, network), '_blank');
  };

  if (transactions.length === 0) {
    return (
      <div className="text-gray-500 text-sm">
        No transactions yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-white font-semibold mb-2">Transaction History</h3>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {transactions.map((tx) => (
          <div 
            key={tx.hash}
            className="bg-gray-800 rounded-lg p-3 border border-gray-700"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={getStatusColor(tx.status)}>
                  {getStatusIcon(tx.status)}
                </span>
                <span className="text-white text-sm font-medium">
                  {getTypeLabel(tx.type)}
                </span>
              </div>
              <span className={getStatusColor(tx.status) + ' text-xs'}>
                {tx.status.toUpperCase()}
              </span>
            </div>
            
            <div className="text-gray-300 text-xs space-y-1">
              <div className="flex justify-between">
                <span>Amount:</span>
                <span className={tx.type === 'entry_fee' ? 'text-red-400' : 'text-green-400'}>
                  {tx.type === 'entry_fee' ? '-' : '+'}
                  {CkbUtils.formatCkb(tx.amount)} CKB
                </span>
              </div>
              
              {tx.fee > 0 && (
                <div className="flex justify-between">
                  <span>Fee:</span>
                  <span className="text-gray-400">
                    {CkbUtils.formatCkb(tx.fee)} CKB
                  </span>
                </div>
              )}
              
              <div className="flex justify-between">
                <span>Time:</span>
                <span className="text-gray-400">
                  {new Date(tx.timestamp).toLocaleTimeString()}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span>Hash:</span>
                <button
                  onClick={() => openExplorer(tx.hash)}
                  className="text-blue-400 hover:text-blue-300 text-xs font-mono"
                  title="View in explorer"
                >
                  {CkbUtils.formatTxHash(tx.hash)}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="text-xs text-gray-500 mt-2">
        Click transaction hash to view in explorer
      </div>
    </div>
  );
};

interface PendingTransactionProps {
  transaction: {
    hash: string;
    type: 'entry_fee' | 'reward' | 'coin_collection';
    amount: number;
    status: 'pending' | 'confirmed' | 'failed';
    timestamp: number;
  };
  network?: 'mainnet' | 'testnet';
}

export const PendingTransaction: React.FC<PendingTransactionProps> = ({ 
  transaction, 
  network = 'testnet' 
}) => {
  if (transaction.status !== 'pending') {
    return null;
  }

  return (
    <div className="bg-yellow-900 bg-opacity-50 border border-yellow-600 rounded-lg p-4 mb-4">
      <div className="flex items-center gap-3">
        <div className="animate-spin">
          <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full"></div>
        </div>
        <div className="flex-1">
          <h4 className="text-yellow-400 font-medium">
            Transaction Processing
          </h4>
          <p className="text-yellow-300 text-sm">
            {transaction.type === 'entry_fee' ? 'Entry fee' : 'Reward'} transaction 
            ({CkbUtils.formatCkb(transaction.amount)} CKB) is being confirmed...
          </p>
          <button
            onClick={() => window.open(CkbUtils.getExplorerUrl(transaction.hash, network), '_blank')}
            className="text-yellow-400 hover:text-yellow-300 text-xs underline mt-1"
          >
            View in explorer: {CkbUtils.formatTxHash(transaction.hash)}
          </button>
        </div>
      </div>
    </div>
  );
};

interface TransactionErrorProps {
  error: string | null;
  onRetry?: () => void;
}

export const TransactionError: React.FC<TransactionErrorProps> = ({ 
  error, 
  onRetry 
}) => {
  if (!error) {
    return null;
  }

  return (
    <div className="bg-red-900 bg-opacity-50 border border-red-600 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        <span className="text-red-400 text-xl">⚠️</span>
        <div className="flex-1">
          <h4 className="text-red-400 font-medium mb-1">
            Transaction Failed
          </h4>
          <p className="text-red-300 text-sm mb-2">
            {error}
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
            >
              Retry Transaction
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

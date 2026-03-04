# CKB Transaction Flow Integration

This document describes the complete transaction flow for the CKB Arcade Endless Runner game using real Nervos CKB blockchain integration.

## Architecture Overview

### Components
- **CkbAdapter**: Real CKB blockchain integration using CCC wallet connector
- **GameEconomy**: Manages game economics and transaction orchestration
- **TransactionStatus**: UI components for transaction state display
- **EndlessRunner**: Main game component with wallet integration

### Key Features
- Real CKB transactions for entry fees and rewards
- Transaction status monitoring and UI updates
- Error handling and retry mechanisms
- Explorer integration for transaction verification
- Local storage for transaction persistence

## Transaction Flow

### 1. Game Start Flow

```
User Clicks "Start Game"
        ↓
Check Wallet Connection
        ↓
Check Balance (199 CKB required)
        ↓
Create Entry Fee Transaction
        ↓
Send 199 CKB to Game Contract
        ↓
Transaction Pending → Confirmed
        ↓
Game Session Starts
```

#### Technical Implementation:
```typescript
// 1. Check balance
const balance = await ckbAdapter.getBalance();
const canAfford = await ckbAdapter.canAffordEntry();

// 2. Create transaction
const txHash = await ckbAdapter.sendEntryFeeTransaction();

// 3. Monitor status
ckbAdapter.monitorTransaction(txHash);

// 4. Start game when confirmed
gameSession.start();
```

### 2. Game Completion Flow

```
Game Ends (Win/Lose)
        ↓
Calculate Rewards
        ↓
If Win: Send Reward Transaction
        ↓
Contract Pays 400 CKB + Coin Value
        ↓
Transaction Confirmed
        ↓
Update Game Statistics
        ↓
Show Results to User
```

#### Technical Implementation:
```typescript
// 1. Complete game session
const result = await ckbAdapter.completeGameSession(won);

// 2. If won, contract sends rewards
if (won) {
  await ckbAdapter.sendRewardTransaction();
}

// 3. Update statistics
const stats = await gameEconomy.getStatistics();
```

### 3. Transaction States

| State | Description | UI Indicator |
|-------|-------------|--------------|
| `pending` | Transaction submitted, awaiting confirmation | ⏳ Yellow |
| `confirmed` | Transaction confirmed on-chain | ✅ Green |
| `failed` | Transaction failed or rejected | ❌ Red |

### 4. Error Handling

#### Common Errors:
- Insufficient balance
- Network connectivity issues
- Transaction rejected by user
- Contract execution failure

#### Error Recovery:
```typescript
try {
  const result = await ckbAdapter.startGameSession();
  if (!result.success) {
    // Show error to user
    setLastError(result.error);
    // Offer retry option
    setShowRetryButton(true);
  }
} catch (error) {
  // Handle unexpected errors
  console.error('Transaction failed:', error);
  setLastError('Unexpected error occurred');
}
```

## Integration Details

### CCC Wallet Connector Integration

```typescript
import { ccc } from '@ckb-ccc/connector-react';

// Initialize adapter with signer
await ckbAdapter.initialize(signer);

// Get wallet address
const address = await signer.getRecommendedAddress();

// Get balance
const balance = await signer.getBalance();

// Send transaction
const txHash = await signer.sendTransaction({
  to: GAME_CONTRACT_ADDRESS,
  amount: ENTRY_FEE,
  data: 'entry_fee',
});
```

### Game Contract Integration

The game contract handles:
- Entry fee collection (199 CKB)
- Reward distribution (400 CKB for wins)
- Coin value calculation (10 CKB per coin)
- Anti-cheat validation
- Session management

### Transaction Monitoring

```typescript
private async monitorTransaction(txHash: string): Promise<void> {
  const checkStatus = async () => {
    const tx = await this.signer.client.getTransaction(txHash);
    if (tx) {
      const status = tx.txStatus.status === 'committed' ? 'confirmed' : 'pending';
      // Update UI state
      this.updateTransactionStatus(txHash, status);
    }
  };

  // Poll every 5 seconds for 2 minutes
  const interval = setInterval(checkStatus, 5000);
  setTimeout(() => clearInterval(interval), 120000);
}
```

## UI Components

### Transaction Status Display
- Real-time transaction updates
- Explorer links for verification
- Error messages and retry options
- Pending transaction indicators

### Balance Display
- Live wallet balance
- Entry fee requirements
- Win/loss statistics
- Transaction history

## Security Considerations

### Transaction Security
1. **User Confirmation**: All transactions require user wallet approval
2. **Contract Validation**: Game contract validates all game actions
3. **Anti-Cheat**: Session tracking prevents manipulation
4. **Fee Management**: Transparent fee structure (0.1% of transaction)

### Data Security
1. **Local Storage**: Transaction history stored locally
2. **Session Persistence**: Game sessions survive page refreshes
3. **Error Boundaries**: Graceful handling of network failures

## Performance Optimizations

### Async Operations
- Non-blocking transaction monitoring
- Background balance updates
- Optimistic UI updates

### Caching
- Transaction status cached locally
- Balance updates debounced
- Statistics calculated efficiently

## Testing Strategy

### Mock vs Real Integration
- Use `MockCkbAdapter` for development/testing
- Switch to `CkbAdapter` for production
- Environment-based adapter selection

### Test Scenarios
1. **Happy Path**: Successful game completion
2. **Insufficient Balance**: Graceful handling
3. **Network Issues**: Retry mechanisms
4. **User Rejection**: Cancellation handling
5. **Contract Failures**: Error recovery

## Deployment Configuration

### Environment Variables
```env
# Game contract address
VITE_GAME_CONTRACT_ADDRESS=ckb1qyq...

# Network configuration
VITE_CKB_NETWORK=testnet

# Explorer URLs
VITE_EXPLORER_URL=https://pudge.explorer.nervos.org
```

### Network Support
- **Testnet**: Development and testing
- **Mainnet**: Production deployment
- **Automatic detection** based on wallet connection

## Future Enhancements

### Planned Features
1. **Batch Transactions**: Multiple games in single transaction
2. **Staking Rewards**: Lock CKB for bonus rewards
3. **Tournament Mode**: Competitive gameplay with prizes
4. **NFT Integration**: Unique game assets as NFTs
5. **Cross-Chain**: Support for other Nervos networks

### Scalability
- Layer 2 solutions for faster transactions
- State channels for instant gameplay
- Optimistic rollups for reduced fees

## Troubleshooting

### Common Issues
1. **Transaction Stuck**: Check network status, retry transaction
2. **Balance Not Updating**: Refresh wallet connection
3. **Contract Not Responding**: Verify contract address
4. **Explorer Links Broken**: Check network configuration

### Debug Tools
- Browser console logs
- Network tab in dev tools
- Transaction explorer
- Wallet connection status

## Conclusion

This integration provides a complete, production-ready CKB transaction system for the arcade game, ensuring security, reliability, and excellent user experience while maintaining the game's performance and playability.

# CKB Arcade Game Economy System

## Overview

The CKB Arcade game implements a comprehensive economy system using a mock CKB adapter for development and testing. This system handles entry fees, coin collection, rewards, and provides a complete gambling economy experience.

## Architecture

### Core Components

1. **MockCkbAdapter** - Simulates CKB blockchain interactions
2. **GameEconomy** - Manages economic aspects of the game
3. **useGameEconomy** - React hook for UI integration
4. **useGameSession** - Manages individual game sessions

## Economic Model

### Entry Fee System
- **Entry Fee**: 199 CKB per game
- **Validation**: Prevents game start if balance < 199 CKB
- **Transaction**: Deducts fee when game starts
- **Refund**: No refunds - entry fee is consumed

### Reward System
- **Base Reward**: 400 CKB for winning (surviving 3 minutes)
- **Coin Collection**: 10 CKB per coin collected
- **Bonus Multipliers**:
  - Rainbow pattern: 2x coin value
  - Cluster pattern: 1.5x coin value
  - Other patterns: 1x coin value

### Net Profit Calculation
```
Net Profit = (Coin Value + Victory Reward) - Entry Fee
```

## Game Flow

### 1. Pre-Game Validation
```typescript
// Check if player can afford entry
if (!gameEconomy.canPlay) {
  showEntryFeeModal();
  return;
}

// Start game session (deducts 199 CKB)
const result = await gameEconomy.startGame();
```

### 2. During Gameplay
```typescript
// Track coin collection in real-time
gameEconomy.updateCoinCollection(coinsCollected);
```

### 3. Game Completion
```typescript
// Complete session and calculate rewards
const result = await gameEconomy.completeGame(won, coinsCollected);

// Display summary
showGameSummary(result.summary);
```

## Mock CKB Adapter

### Features
- **Deterministic Transactions**: Same seed = same results
- **Balance Management**: Track available, locked, and total CKB
- **Transaction History**: Complete audit trail
- **Game Statistics**: Win rate, profit tracking
- **Anti-Cheat Ready**: Server can validate all transactions

### Key Methods
```typescript
// Check balance
const balance = mockCkbAdapter.getBalance();

// Start game (deduct entry fee)
const result = await mockCkbAdapter.startGameSession();

// Update coin collection
mockCkbAdapter.updateCoinCollection(coinsCollected);

// Complete game (handle rewards)
const summary = await mockCkbAdapter.completeGameSession(won);
```

## UI Integration

### React Hooks
```typescript
// Main economy hook
const {
  canPlay,
  currentBalance,
  entryFee,
  startGame,
  updateCoinCollection,
  completeGame,
  formatBalance,
} = useGameEconomy();

// Session management
const {
  sessionSummary,
  showSummary,
  startSession,
  endSession,
  hideSummary,
} = useGameSession();
```

### HUD Display
- Real-time balance display
- Coin collection counter
- Entry fee status
- Transaction processing indicators

### Modals
- **Entry Fee Modal**: Shows when insufficient balance
- **Game Summary Modal**: Displays detailed results after each game

## Anti-Cheat Features

### Deterministic Spawning
- Same seed = identical coin positions
- Server can verify client-side coin generation
- Prevents coin manipulation

### Transaction Validation
- All transactions logged with unique hashes
- Complete audit trail available
- Server can validate game economics

### Session Integrity
- Each game session has unique ID
- Start/end times recorded
- Coin collection tracked in real-time

## Economic Sustainability

### Target Metrics
- **Maximum Win Rate**: 45% (to maintain economy)
- **House Edge**: Built into entry fee vs reward ratio
- **Player Retention**: Coin collection provides partial wins

### Balance Mechanics
- Entry fee: 199 CKB
- Maximum win: 400 CKB + coin value
- Expected player return: ~90% (sustainable gambling model)

## Testing Features

### Mock Functions
```typescript
// Add test funds
gameEconomy.addFunds(1000); // Add 1000 CKB

// Reset economy
gameEconomy.reset(); // Reset to initial state
```

### Development Mode
- Test buttons in UI for adding funds
- Console logging for transaction debugging
- Statistics tracking for balance testing

## Production Integration

### Real CKB Adapter
Replace `MockCkbAdapter` with real CKB blockchain integration:

```typescript
// Replace mock with real adapter
import { RealCkbAdapter } from './RealCkbAdapter';
export const ckbAdapter = new RealCkbAdapter();
```

### Security Considerations
- Server-side transaction validation
- Client-side results verification
- Anti-manipulation checks
- Rate limiting for game starts

## File Structure

```
systems/
├── MockCkbAdapter.ts     # Mock blockchain adapter
├── GameEconomy.ts        # Economy management
├── useGameEconomy.ts     # React hooks
└── README.md            # This documentation
```

## Usage Examples

### Basic Game Start
```typescript
const handleStartGame = async () => {
  if (!gameEconomy.canPlay) {
    setShowEntryFeeModal(true);
    return;
  }
  
  const result = await gameEconomy.startGame();
  if (result.success) {
    startGameplay();
  } else {
    showError(result.error);
  }
};
```

### Coin Collection Tracking
```typescript
const onCoinCollected = (coinValue: number) => {
  gameEconomy.updateCoinCollection(currentCoins + coinValue);
  updateUI();
};
```

### Game Completion
```typescript
const handleGameEnd = async (won: boolean, coins: number) => {
  const result = await gameEconomy.completeGame(won, coins);
  if (result.success) {
    showSummary(result.summary);
  }
};
```

## Future Enhancements

### Planned Features
- **Tournament Mode**: Multi-player competitions
- **Progressive Jackpots**: Accumulating reward pools
- **Leaderboards**: Global ranking system
- **Achievement System**: Unlockable rewards
- **VIP Tiers**: Enhanced rewards for frequent players

### Blockchain Integration
- **Smart Contracts**: Automated reward distribution
- **NFT Rewards**: Unique collectibles
- **Staking Rewards**: CKB staking for bonuses
- **Cross-Chain**: Support for other blockchains

## Conclusion

The CKB Arcade economy system provides a complete, sustainable gambling experience with proper economic controls, anti-cheat measures, and excellent user experience. The mock adapter allows for thorough testing before real blockchain integration.

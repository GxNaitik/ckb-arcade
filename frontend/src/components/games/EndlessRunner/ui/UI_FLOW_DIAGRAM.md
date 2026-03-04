# CKB Arcade UI Flow Documentation

## Component List

### Core UI Components
1. **UIManager** - Main orchestrator component
2. **StartScreen** - Initial game entry point
3. **WalletConnectScreen** - Wallet connection interface
4. **EntryConfirmationScreen** - Entry fee confirmation
5. **InGameHUD** - Real-time game overlay
6. **GameOverSummary** - Results and rewards display

### Integration Components
- **EndlessRunner** - Main game component (Canvas + UI)
- **useUIManager** - Hook for UI state management

## UI State Flow Diagram

```
┌─────────────────┐
│   START SCREEN  │
│                 │
│ • Game Title    │
│ • Features      │
│ • Wallet Status │
│ • Play Button   │
└─────────┬───────┘
          │
          ▼
    ┌─────────────┐
    │ Wallet     │
    │ Connected? │
    └─────┬───────┘
          │
    ┌─────▼─────┐    ┌─────────────────┐
    │    YES    │    │      NO        │
    └─────┬─────┘    └─────────┬───────┘
          │                    │
          ▼                    ▼
    ┌─────────────┐    ┌─────────────────┐
    │ Balance     │    │ WALLET CONNECT │
    │ ≥ 199 CKB?  │    │                 │
    └─────┬───────┘    │ • Wallet List   │
          │            │ • Connection    │
    ┌─────▼─────┐    │ • Status        │
    │    YES    │    └─────────┬───────┘
    └─────┬─────┘              │
          │                    ▼
          ▼            ┌─────────────────┐
    ┌─────────────┐    │ ENTRY CONFIRM │
    │ ENTRY FEE   │    │                 │
    │ CONFIRM     │    │ • Fee Details  │
    │             │    │ • Rules        │
    └─────┬───────┘    │ • Confirm/Cancel│
          │            └─────────┬───────┘
          ▼                      │
    ┌─────────────┐              ▼
    │ LOADING     │      ┌─────────────┐
    │             │      │   START     │
    │ • Process   │      │   SCREEN    │
    │ • TX Confirm│      └─────────────┘
    └─────┬───────┘
          │
          ▼
    ┌─────────────┐
    │   PLAYING   │
    │             │
    │ • HUD       │
    │ • Stats     │
    │ • Controls  │
    └─────┬───────┘
          │
    ┌─────▼─────┐
    │ Game Over? │
    └─────┬─────┘
          │
    ┌─────▼─────┐    ┌─────────────────┐
    │    YES    │    │      NO        │
    └─────┬─────┘    └─────────┬───────┘
          │                    │
          ▼                    ▼
    ┌─────────────┐    ┌─────────────────┐
    │ GAME OVER   │    │    PAUSED      │
    │             │    │                 │
    │ • Results   │    │ • Pause Menu   │
    │ • Rewards   │    │ • Resume/Quit  │
    │ • Play Again│    └─────────┬───────┘
    └─────┬───────┘              │
          │                    │
          ▼                    ▼
    ┌─────────────┐    ┌─────────────────┐
    │ Play Again? │    │   Resume Game   │
    └─────┬───────┘    └─────────┬───────┘
          │                    │
    ┌─────▼─────┐    ┌─────▼─────┐
    │    YES    │    │    PLAYING │
    └─────┬─────┘    └─────────────┘
          │
          ▼
    ┌─────────────┐
    │ ENTRY FEE   │
    │ CONFIRM     │
    └─────────────┘
```

## State Transitions

### Primary States
- **start**: Initial screen with game info
- **wallet-connect**: Wallet selection and connection
- **entry-confirmation**: Entry fee confirmation dialog
- **playing**: Active gameplay with HUD overlay
- **paused**: Game paused with menu overlay
- **game-over**: Results screen with rewards
- **loading**: Processing states between screens

### Transition Triggers

#### Start → Wallet Connect
- **Trigger**: User clicks "Connect Wallet"
- **Condition**: !walletConnected
- **Action**: Show wallet selection screen

#### Start → Entry Confirmation
- **Trigger**: User clicks "Start Game"
- **Condition**: walletConnected && balance < 199
- **Action**: Show insufficient balance modal

#### Start → Loading
- **Trigger**: User clicks "Start Game"
- **Condition**: walletConnected && balance ≥ 199
- **Action**: Process entry fee payment

#### Entry Confirmation → Loading
- **Trigger**: User confirms entry fee
- **Action**: Process payment and start game

#### Loading → Playing
- **Trigger**: Payment successful
- **Action**: Start game loop and show HUD

#### Playing → Paused
- **Trigger**: User presses pause button or 'P' key
- **Action**: Pause game loop and show pause menu

#### Paused → Playing
- **Trigger**: User clicks "Resume"
- **Action**: Resume game loop

#### Playing → Game Over
- **Trigger**: Game ends (win/lose)
- **Action**: Show results screen

#### Game Over → Entry Confirmation
- **Trigger**: User clicks "Play Again"
- **Condition**: balance < 199
- **Action**: Show entry confirmation

#### Game Over → Loading
- **Trigger**: User clicks "Play Again"
- **Condition**: balance ≥ 199
- **Action**: Process new entry fee

## Data Flow Architecture

### React State (UI Only)
```typescript
type UIState = {
  screen: 'start' | 'wallet-connect' | 'entry-confirmation' | 'playing' | 'paused' | 'game-over' | 'loading';
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
  gameResults: GameResults | null;
};
```

### Canvas State (Gameplay Only)
```typescript
// Game engine uses refs for performance
// No React re-renders during gameplay
// 60 FPS updates without UI overhead
```

### Communication Pattern
```
Game Engine (Canvas) → Game Stats → UI State → UI Components
UI Components → User Actions → Game Engine → Canvas Updates
```

## Component Responsibilities

### UIManager
- **State Management**: Orchestrates all UI states
- **Navigation**: Handles screen transitions
- **Data Flow**: Passes data between components
- **Error Handling**: Manages loading and error states

### StartScreen
- **Game Branding**: Title, features, description
- **Wallet Status**: Connection state and balance
- **Entry Point**: Primary call-to-action buttons
- **Information**: How to play and support links

### WalletConnectScreen
- **Wallet Selection**: List of available wallets
- **Connection Process**: Async wallet connection
- **Error Handling**: Connection failure feedback
- **User Guidance**: Help and security information

### EntryConfirmationScreen
- **Transaction Details**: Entry fee, balance, remaining
- **Game Rules**: Clear explanation of gameplay
- **Risk Warning**: Non-refundable entry fee notice
- **Confirmation**: Explicit user consent required

### InGameHUD
- **Real-time Stats**: Coins, distance, speed, time
- **Progress Tracking**: Visual progress bar
- **Game Controls**: Pause, mobile controls
- **Performance Info**: FPS, connection status

### GameOverSummary
- **Results Display**: Win/loss status, statistics
- **Financial Summary**: Entry fee, rewards, profit/loss
- **Achievement Badges**: Performance recognition
- **Replay Options**: Play again or quit to menu

## Performance Considerations

### React State Optimization
- **Minimal State**: Only UI-relevant data in React state
- **Stable References**: useCallback and useMemo for expensive operations
- **Conditional Rendering**: Components only render when active

### Canvas Separation
- **No React Overhead**: Game loop runs independently
- **60 FPS Performance**: Smooth gameplay without UI interference
- **Efficient Updates**: Only render when necessary

### Memory Management
- **Component Cleanup**: Proper unmounting and cleanup
- **Event Listeners**: Remove listeners on unmount
- **Timer Management**: Clear intervals and timeouts

## Responsive Design

### Desktop Layout
- **Full Screen**: Immersive gameplay experience
- **Keyboard Controls**: Primary input method
- **Mouse Interaction**: UI buttons and menus

### Mobile Layout
- **Touch Controls**: On-screen buttons for movement
- **Adaptive HUD**: Smaller stats and controls
- **Gesture Support**: Swipe controls for navigation

### Accessibility
- **Keyboard Navigation**: Full keyboard access
- **Screen Reader**: ARIA labels and descriptions
- **High Contrast**: Clear visual hierarchy
- **Text Scaling**: Resizable text for readability

## Error Handling

### Connection Errors
- **Wallet Issues**: Clear error messages and retry options
- **Network Problems**: Offline detection and guidance
- **Transaction Failures**: Fee explanations and alternatives

### Game Errors
- **State Corruption**: Automatic reset and recovery
- **Performance Issues**: Quality settings and optimization
- **Save Failures**: Local storage fallback

### UI Errors
- **Component Crashes**: Error boundaries and recovery
- **State Inconsistencies**: Validation and correction
- **Navigation Issues**: Fallback navigation paths

## Testing Strategy

### Component Testing
- **Unit Tests**: Individual component functionality
- **Integration Tests**: Component interaction testing
- **State Testing**: State transition validation

### User Testing
- **Flow Testing**: Complete user journey validation
- **Performance Testing**: Load and stress testing
- **Accessibility Testing**: Screen reader and keyboard testing

### E2E Testing
- **Gameplay Testing**: Full game simulation
- **Transaction Testing**: Wallet and payment flows
- **Cross-browser Testing**: Compatibility validation

This UI flow ensures a smooth, intuitive user experience while maintaining clear separation between UI state management and gameplay logic.

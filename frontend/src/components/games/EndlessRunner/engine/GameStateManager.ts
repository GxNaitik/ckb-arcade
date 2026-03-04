import { useRef, useCallback } from 'react';

/**
 * Core game state interfaces
 */
export interface PlayerState {
  x: number;
  y: number;
  z: number; // Depth for 3D effect
  lane: number; // 0 = left, 1 = center, 2 = right
  velocity: { x: number; y: number; z: number };
  isJumping: boolean;
  isSliding: boolean;
  animationState: 'idle' | 'running' | 'jumping' | 'sliding' | 'crashed';
  health: number;
}

export interface ObstacleState {
  id: string;
  type: 'train' | 'barrier' | 'tunnel' | 'ramp';
  x: number;
  y: number;
  z: number;
  lane: number;
  width: number;
  height: number;
  depth: number;
  speed: number;
}

export interface CoinState {
  id: string;
  x: number;
  y: number;
  z: number;
  lane: number;
  collected: boolean;
  value: number;
}

export interface EnvironmentState {
  speed: number; // Current game speed
  distance: number; // Total distance traveled
  backgroundOffset: number; // For parallax scrolling
  lightingLevel: number; // Dynamic lighting (0-1)
  timeOfDay: 'day' | 'night' | 'sunset' | 'cyberpunk';
}

export interface GameState {
  // Core game state (stored in refs for performance)
  player: PlayerState;
  obstacles: ObstacleState[];
  coins: CoinState[];
  environment: EnvironmentState;
  
  // Game metrics
  score: number;
  ckbCoinsCollected: number;
  combo: number;
  multiplier: number;
  
  // Game status
  isGameOver: boolean;
  isPaused: boolean;
  gameStarted: boolean;
  
  // Timing
  gameStartTime: number;
  lastSpawnTime: number;
  lastCoinSpawnTime: number;
}

/**
 * Game state manager using refs
 * 
 * Why refs are critical for game state:
 * - Game state updates 60 times per second
 * - React state would cause 60 re-renders per second (performance killer)
 * - refs allow direct mutation without triggering React lifecycle
 * - Only UI state should use React state
 */
export const useGameState = () => {
  // Initialize game state in ref
  const gameStateRef = useRef<GameState>({
    player: {
      x: 0,
      y: 0,
      z: 0,
      lane: 1, // Start in center lane
      velocity: { x: 0, y: 0, z: 0 },
      isJumping: false,
      isSliding: false,
      animationState: 'idle',
      health: 100,
    },
    obstacles: [],
    coins: [],
    environment: {
      speed: 10, // Starting speed
      distance: 0,
      backgroundOffset: 0,
      lightingLevel: 1.0,
      timeOfDay: 'day',
    },
    score: 0,
    ckbCoinsCollected: 0,
    combo: 0,
    multiplier: 1,
    isGameOver: false,
    isPaused: false,
    gameStarted: false,
    gameStartTime: 0,
    lastSpawnTime: 0,
    lastCoinSpawnTime: 0,
  });

  /**
   * Update player state
   * Direct mutation for performance (no React re-render)
   */
  const updatePlayer = useCallback((updates: Partial<PlayerState>) => {
    const player = gameStateRef.current.player;
    Object.assign(player, updates);
  }, []);

  /**
   * Update environment state
   * Handles speed progression and distance tracking
   */
  const updateEnvironment = useCallback((deltaTime: number) => {
    const env = gameStateRef.current.environment;
    
    // Update distance based on speed and delta time
    env.distance += env.speed * (deltaTime / 1000);
    
    // Update background offset for parallax effect
    env.backgroundOffset += env.speed * (deltaTime / 1000);
    
    // Progressive speed increase (every 10 seconds, increase by 10%)
    const speedIncreaseInterval = 10000; // 10 seconds
    const speedIncreaseRate = 0.1; // 10% increase
    
    if (env.distance > 0 && Math.floor(env.distance / 1000) % 10 === 0) {
      const timeSinceLastIncrease = Date.now() - gameStateRef.current.gameStartTime;
      if (timeSinceLastIncrease > speedIncreaseInterval) {
        env.speed *= (1 + speedIncreaseRate);
        gameStateRef.current.gameStartTime = Date.now(); // Reset timer
      }
    }
    
    // Update lighting based on distance (day/night cycle)
    const dayNightCycle = (env.distance / 1000) % 100; // 100 unit cycle
    if (dayNightCycle < 25) {
      env.timeOfDay = 'day';
      env.lightingLevel = 1.0;
    } else if (dayNightCycle < 50) {
      env.timeOfDay = 'sunset';
      env.lightingLevel = 0.8;
    } else if (dayNightCycle < 75) {
      env.timeOfDay = 'night';
      env.lightingLevel = 0.3;
    } else {
      env.timeOfDay = 'cyberpunk';
      env.lightingLevel = 0.6;
    }
  }, []);

  /**
   * Add obstacle to game state
   */
  const addObstacle = useCallback((obstacle: Omit<ObstacleState, 'id'>) => {
    const newObstacle: ObstacleState = {
      ...obstacle,
      id: `obstacle_${Date.now()}_${Math.random()}`,
    };
    gameStateRef.current.obstacles.push(newObstacle);
  }, []);

  /**
   * Add coin to game state
   */
  const addCoin = useCallback((coin: Omit<CoinState, 'id'>) => {
    const newCoin: CoinState = {
      ...coin,
      id: `coin_${Date.now()}_${Math.random()}`,
    };
    gameStateRef.current.coins.push(newCoin);
  }, []);

  /**
   * Remove obstacle by ID
   */
  const removeObstacle = useCallback((id: string) => {
    const state = gameStateRef.current;
    state.obstacles = state.obstacles.filter(obs => obs.id !== id);
  }, []);

  /**
   * Remove coin by ID
   */
  const removeCoin = useCallback((id: string) => {
    const state = gameStateRef.current;
    state.coins = state.coins.filter(coin => coin.id !== id);
  }, []);

  /**
   * Collect coin (update score and remove coin)
   */
  const collectCoin = useCallback((coinId: string) => {
    const state = gameStateRef.current;
    const coin = state.coins.find(c => c.id === coinId);
    
    if (coin && !coin.collected) {
      coin.collected = true;
      state.ckbCoinsCollected += coin.value;
      state.score += coin.value * state.multiplier;
      
      // Update combo
      state.combo++;
      
      // Update multiplier (combo bonus)
      if (state.combo > 0 && state.combo % 10 === 0) {
        state.multiplier += 0.5;
      }
      
      // Remove collected coin
      removeCoin(coinId);
      
      return true;
    }
    
    return false;
  }, [removeCoin]);

  /**
   * Reset combo on collision
   */
  const resetCombo = useCallback(() => {
    const state = gameStateRef.current;
    state.combo = 0;
    state.multiplier = 1;
  }, []);

  /**
   * Update obstacles position based on game speed
   */
  const updateObstacles = useCallback((deltaTime: number) => {
    const state = gameStateRef.current;
    const speedFactor = state.environment.speed * (deltaTime / 1000);
    
    // Move obstacles towards player
    state.obstacles.forEach(obstacle => {
      obstacle.z -= speedFactor;
    });
    
    // Remove obstacles that have passed the player
    state.obstacles = state.obstacles.filter(obs => obs.z > -10);
  }, []);

  /**
   * Update coins position based on game speed
   */
  const updateCoins = useCallback((deltaTime: number) => {
    const state = gameStateRef.current;
    const speedFactor = state.environment.speed * (deltaTime / 1000);
    
    // Move coins towards player
    state.coins.forEach(coin => {
      coin.z -= speedFactor;
    });
    
    // Remove coins that have passed the player
    state.coins = state.coins.filter(coin => coin.z > -10);
  }, []);

  /**
   * Initialize new game
   */
  const initializeGame = useCallback(() => {
    const state = gameStateRef.current;
    
    // Reset player
    state.player = {
      x: 0,
      y: 0,
      z: 0,
      lane: 1,
      velocity: { x: 0, y: 0, z: 0 },
      isJumping: false,
      isSliding: false,
      animationState: 'running',
      health: 100,
    };
    
    // Reset environment
    state.environment = {
      speed: 10,
      distance: 0,
      backgroundOffset: 0,
      lightingLevel: 1.0,
      timeOfDay: 'day',
    };
    
    // Clear entities
    state.obstacles = [];
    state.coins = [];
    
    // Reset game metrics
    state.score = 0;
    state.ckbCoinsCollected = 0;
    state.combo = 0;
    state.multiplier = 1;
    
    // Reset game status
    state.isGameOver = false;
    state.isPaused = false;
    state.gameStarted = true;
    state.gameStartTime = Date.now();
    state.lastSpawnTime = Date.now();
    state.lastCoinSpawnTime = Date.now();
  }, []);

  /**
   * End game
   */
  const endGame = useCallback(() => {
    const state = gameStateRef.current;
    state.isGameOver = true;
    state.player.animationState = 'crashed';
  }, []);

  /**
   * Get current game state (for UI components)
   * Returns a copy to prevent direct mutation
   */
  const getGameState = useCallback((): GameState => {
    return JSON.parse(JSON.stringify(gameStateRef.current));
  }, []);

  /**
   * Get player state (for collision detection)
   */
  const getPlayerState = useCallback((): PlayerState => {
    return { ...gameStateRef.current.player };
  }, []);

  /**
   * Get obstacles (for collision detection)
   */
  const getObstacles = useCallback((): ObstacleState[] => {
    return [...gameStateRef.current.obstacles];
  }, []);

  /**
   * Get coins (for collection detection)
   */
  const getCoins = useCallback((): CoinState[] => {
    return [...gameStateRef.current.coins];
  }, []);

  return {
    // State mutation methods (high performance, no re-renders)
    updatePlayer,
    updateEnvironment,
    addObstacle,
    addCoin,
    removeObstacle,
    removeCoin,
    collectCoin,
    resetCombo,
    updateObstacles,
    updateCoins,
    
    // Game lifecycle methods
    initializeGame,
    endGame,
    
    // State getters (for UI and systems)
    getGameState,
    getPlayerState,
    getObstacles,
    getCoins,
  };
};

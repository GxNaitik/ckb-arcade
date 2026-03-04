import React, { useEffect, useRef, useCallback, useState } from 'react';
import { ccc } from '@ckb-ccc/connector-react';
import { useGameLoop } from './engine/GameEngine';
import { useGameEconomy } from './systems/useGameEconomy';


/**
 * Props for the EndlessRunner component
 */
interface EndlessRunnerProps {
  gameAddress: string;
  walletAddress?: string;
  onConnect?: () => void;
  signer?: ReturnType<typeof ccc.useSigner> | null;
  onTx?: (txHash: string) => void;
  onWin: (winner: string) => void;
}

/**
 * Game configuration constants - Chrome Dino Style
 */
const GAME_CONFIG = {
  ENTRY_FEE_CKB: 200,
  CANVAS_WIDTH: 1200,
  CANVAS_HEIGHT: 400,
  GROUND_Y: 320,
  GRAVITY: 0.6,
  JUMP_FORCE: -12,
  BASE_SPEED: 5,
  MAX_SPEED: 15,
  SPEED_INCREMENT: 0.1,
  SPEED_INCREASE_INTERVAL: 600, // frames (~10 seconds at 60fps)
  REWARD_TIERS: {
    TIER_1: { time: 60, reward: 200 },      // 1 minute = 200 CKB
    TIER_2: { time: 300, reward: 500 },   // 5 minutes = 500 CKB
    TIER_3: { time: 600, reward: 1000 },  // 10 minutes = 1000 CKB
  },
} as const;

// Obstacle types
interface Obstacle {
  id: string;
  type: 'cactus_small' | 'cactus_large' | 'cactus_group' | 'bird_low' | 'bird_mid' | 'bird_high';
  x: number;
  y: number;
  width: number;
  height: number;
  passed: boolean;
}

// Game entities
interface DinoState {
  x: number;
  y: number;
  width: number;
  height: number;
  velocityY: number;
  isJumping: boolean;
  isDucking: boolean;
  runFrame: number;
}

// Sound effects using Web Audio API
const playCheckpointSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
    oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1); // E5
    oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2); // G5
    oscillator.frequency.setValueAtTime(1046.50, audioContext.currentTime + 0.3); // C6

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (e) {
    console.log('Audio not supported');
  }
};

const playCollisionSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(150, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.3);

    gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (e) {
    console.log('Audio not supported');
  }
};

// Cloud for parallax background
interface Cloud {
  x: number;
  y: number;
  width: number;
  speed: number;
}

/**
 * Main Endless Runner Game Component - Chrome Dino Style
 * 
 * 2D side-scrolling endless runner with T-Rex character
 * Time-based survival rewards
 */
export const EndlessRunner: React.FC<EndlessRunnerProps> = ({
  gameAddress: _gameAddress,
  walletAddress,
  onConnect,
  signer,
  onTx: _onTx,
  onWin: _onWin,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  // UI State
  const [uiState, setUiState] = useState({
    gameStatus: 'idle' as 'idle' | 'ready' | 'playing' | 'paused' | 'gameover',
    survivalTime: 0,
    speed: GAME_CONFIG.BASE_SPEED as number,
    score: 0,
    showEntryFeeModal: false,
    isProcessingPayment: false,
    lastError: null as string | null,
    showTransactionHistory: false,
    currentRewardTier: 0,
    rewardClaimed: false,
    rewardTxId: null as string | null,
    rewardAmount: 0,
  });

  // Game state refs (for performance - no React re-renders)
  const gameStateRef = useRef({
    dino: {
      x: 50,
      y: GAME_CONFIG.GROUND_Y,
      width: 40,
      height: 60,
      velocityY: 0,
      isJumping: false,
      isDucking: false,
      runFrame: 0,
    } as DinoState,
    obstacles: [] as Obstacle[],
    clouds: [] as Cloud[],
    nextObstacleId: 0,
    speed: GAME_CONFIG.BASE_SPEED as number,
    distance: 0,
    survivalTime: 0,
    isNightMode: false,
    gameOver: false,
    frames: 0,
    checkpointsReached: new Set<number>(),
  });

  // Game status ref to avoid stale closures
  const gameStatusRef = useRef(uiState.gameStatus);
  useEffect(() => {
    gameStatusRef.current = uiState.gameStatus;
  }, [uiState.gameStatus]);

  // Game economy system
  const gameEconomy = useGameEconomy(_gameAddress, signer);
  const [_transactions, setTransactions] = useState<any[]>([]);

  // Load transaction history
  useEffect(() => {
    const loadTransactions = async () => {
      try {
        const history = gameEconomy.getTransactionHistory();
        setTransactions(history);
      } catch (error) {
        console.error('Failed to load transaction history:', error);
      }
    };

    loadTransactions();
    const interval = setInterval(loadTransactions, 5000);
    return () => clearInterval(interval);
  }, [gameEconomy]);

  // Game loop
  const gameLoop = useGameLoop({
    onFrame: handleGameFrame,
    targetFPS: 60,
    autoStart: false,
  });

  /**
   * Main game frame update - Chrome Dino Style
   */
  function handleGameFrame(_deltaTime: number, _gameTime: number) {
    if (gameStatusRef.current !== 'playing') return;

    const gameState = gameStateRef.current;
    if (gameState.gameOver) {
      handleGameOver();
      return;
    }

    gameState.frames++;

    // Update survival time
    gameState.survivalTime += 1 / 60;

    // Gradually increase speed
    if (gameState.frames % (GAME_CONFIG.SPEED_INCREASE_INTERVAL as number) === 0) {
      gameState.speed = Math.min(GAME_CONFIG.MAX_SPEED as number, gameState.speed + (GAME_CONFIG.SPEED_INCREMENT as number));
    }

    // Toggle night mode every 600 frames (~10 seconds)
    if (gameState.frames % 600 === 0) {
      gameState.isNightMode = !gameState.isNightMode;
    }

    // Update game entities
    updateDino();
    updateObstacles();
    updateClouds();
    spawnObstacles();
    spawnClouds();
    checkCollisions();

    // Update UI state every 10 frames (~6 times per second)
    if (gameState.frames % 10 === 0) {
      const rewardTier = calculateRewardTier(gameState.survivalTime);
      setUiState(prev => ({
        ...prev,
        survivalTime: Math.floor(gameState.survivalTime),
        speed: Math.floor(gameState.speed * 10) / 10,
        score: Math.floor(gameState.distance / 10),
        currentRewardTier: rewardTier,
      }));

      // Check for checkpoints and play sounds
      const survivalSeconds = Math.floor(gameState.survivalTime);
      const checkpoints = [60, 300, 600]; // 1min, 5min, 10min

      for (const checkpoint of checkpoints) {
        if (survivalSeconds >= checkpoint && !gameState.checkpointsReached.has(checkpoint)) {
          gameState.checkpointsReached.add(checkpoint);
          playCheckpointSound();
          break; // Only play one sound per frame
        }
      }
    }

    renderFrame();
  }

  /**
   * Update T-Rex physics
   */
  function updateDino() {
    const dino = gameStateRef.current.dino;

    // Apply gravity
    if (dino.isJumping) {
      dino.velocityY += GAME_CONFIG.GRAVITY;
      dino.y += dino.velocityY;

      // Landing
      if (dino.y >= GAME_CONFIG.GROUND_Y) {
        dino.y = GAME_CONFIG.GROUND_Y;
        dino.velocityY = 0;
        dino.isJumping = false;
      }
    }

    // Update run animation frame
    if (!dino.isJumping && !dino.isDucking) {
      gameStateRef.current.dino.runFrame += 0.2;
    }

    // Ducking state adjustments
    if (dino.isDucking) {
      dino.height = 35;
      dino.y = GAME_CONFIG.GROUND_Y + 25;
    } else {
      dino.height = 60;
      dino.y = Math.min(dino.y, GAME_CONFIG.GROUND_Y);
    }
  }

  /**
   * Spawn obstacles
   */
  function spawnObstacles() {
    const gameState = gameStateRef.current;

    // Minimum distance between obstacles
    const minGap = 250 + Math.random() * 150;
    const lastObstacle = gameState.obstacles[gameState.obstacles.length - 1];

    if (!lastObstacle || (GAME_CONFIG.CANVAS_WIDTH - lastObstacle.x) > minGap) {
      // Random spawn chance based on speed
      if (Math.random() < 0.02 + gameState.speed * 0.002) {
        const obstacle = createObstacle();
        gameState.obstacles.push(obstacle);
      }
    }
  }

  /**
   * Create a new obstacle
   */
  function createObstacle(): Obstacle {
    const gameState = gameStateRef.current;
    const id = `obs_${gameState.nextObstacleId++}`;

    // Determine obstacle type based on speed and randomness
    const types: Obstacle['type'][] = ['cactus_small', 'cactus_large', 'cactus_group'];

    // Add birds only after 30 seconds
    if (gameState.survivalTime > 30) {
      types.push('bird_low', 'bird_mid', 'bird_high');
    }

    const type = types[Math.floor(Math.random() * types.length)];

    switch (type) {
      case 'cactus_small':
        return {
          id,
          type,
          x: GAME_CONFIG.CANVAS_WIDTH,
          y: GAME_CONFIG.GROUND_Y - 35,
          width: 25,
          height: 35,
          passed: false,
        };
      case 'cactus_large':
        return {
          id,
          type,
          x: GAME_CONFIG.CANVAS_WIDTH,
          y: GAME_CONFIG.GROUND_Y - 50,
          width: 30,
          height: 50,
          passed: false,
        };
      case 'cactus_group':
        return {
          id,
          type,
          x: GAME_CONFIG.CANVAS_WIDTH,
          y: GAME_CONFIG.GROUND_Y - 35,
          width: 70,
          height: 35,
          passed: false,
        };
      case 'bird_low':
        return {
          id,
          type,
          x: GAME_CONFIG.CANVAS_WIDTH,
          y: GAME_CONFIG.GROUND_Y - 35,
          width: 40,
          height: 30,
          passed: false,
        };
      case 'bird_mid':
        return {
          id,
          type,
          x: GAME_CONFIG.CANVAS_WIDTH,
          y: GAME_CONFIG.GROUND_Y - 85,
          width: 40,
          height: 30,
          passed: false,
        };
      case 'bird_high':
        return {
          id,
          type,
          x: GAME_CONFIG.CANVAS_WIDTH,
          y: GAME_CONFIG.GROUND_Y - 120,
          width: 40,
          height: 30,
          passed: false,
        };
      default:
        return {
          id,
          type: 'cactus_small',
          x: GAME_CONFIG.CANVAS_WIDTH,
          y: GAME_CONFIG.GROUND_Y - 35,
          width: 25,
          height: 35,
          passed: false,
        };
    }
  }

  /**
   * Update obstacles (scroll left)
   */
  function updateObstacles() {
    const gameState = gameStateRef.current;

    for (const obstacle of gameState.obstacles) {
      obstacle.x -= gameState.speed;

      // Track distance
      if (!obstacle.passed && obstacle.x + obstacle.width < gameState.dino.x) {
        obstacle.passed = true;
        gameState.distance += 10;
      }
    }

    // Remove off-screen obstacles
    gameState.obstacles = gameState.obstacles.filter(obs => obs.x + obs.width > -50);
  }

  /**
   * Spawn clouds for parallax background
   */
  function spawnClouds() {
    const gameState = gameStateRef.current;

    if (Math.random() < 0.01) {
      gameState.clouds.push({
        x: GAME_CONFIG.CANVAS_WIDTH,
        y: 50 + Math.random() * 100,
        width: 60 + Math.random() * 40,
        speed: 0.5 + Math.random() * 0.5,
      });
    }
  }

  /**
   * Update clouds
   */
  function updateClouds() {
    const gameState = gameStateRef.current;

    for (const cloud of gameState.clouds) {
      cloud.x -= cloud.speed;
    }

    gameState.clouds = gameState.clouds.filter(cloud => cloud.x + cloud.width > -50);
  }

  /**
   * AABB collision detection - with forgiveness for fair gameplay
   */
  function checkCollisions() {
    const gameState = gameStateRef.current;
    const dino = gameState.dino;

    // Dino y is the BOTTOM edge, so top of dino is y - height
    const dinoTop = dino.y - dino.height;

    // Make hitbox much smaller - more forgiveness (20% margin)
    const marginX = dino.width * 0.2;
    const marginY = dino.height * 0.2;
    const dinoHitbox = {
      x: dino.x + marginX,
      y: dinoTop + marginY,
      width: dino.width - marginX * 2,
      height: dino.height - marginY * 2,
    };

    for (const obstacle of gameState.obstacles) {
      // Obstacle y is also the BOTTOM edge
      const obsTop = obstacle.y - obstacle.height;

      // Shrink obstacle hitbox too for fairness (15% margin)
      const obsMarginX = obstacle.width * 0.15;
      const obsMarginY = obstacle.height * 0.15;
      const obsHitbox = {
        x: obstacle.x + obsMarginX,
        y: obsTop + obsMarginY,
        width: obstacle.width - obsMarginX * 2,
        height: obstacle.height - obsMarginY * 2,
      };

      if (
        dinoHitbox.x < obsHitbox.x + obsHitbox.width &&
        dinoHitbox.x + dinoHitbox.width > obsHitbox.x &&
        dinoHitbox.y < obsHitbox.y + obsHitbox.height &&
        dinoHitbox.y + dinoHitbox.height > obsHitbox.y
      ) {
        gameState.gameOver = true;
        playCollisionSound();
        return;
      }
    }
  }

  /**
   * Calculate reward tier based on survival time
   */
  function calculateRewardTier(survivalTime: number): number {
    if (survivalTime >= GAME_CONFIG.REWARD_TIERS.TIER_3.time) return 3;
    if (survivalTime >= GAME_CONFIG.REWARD_TIERS.TIER_2.time) return 2;
    if (survivalTime >= GAME_CONFIG.REWARD_TIERS.TIER_1.time) return 1;
    return 0;
  }



  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    const gameState = gameStateRef.current;
    const W = GAME_CONFIG.CANVAS_WIDTH;
    const H = GAME_CONFIG.CANVAS_HEIGHT;
    const dino = gameState.dino;

    ctx.clearRect(0, 0, W, H);

    const skyColor = gameState.isNightMode ? '#1a1a2e' : '#f0f0f0';
    ctx.fillStyle = skyColor;
    ctx.fillRect(0, 0, W, H);

    if (gameState.isNightMode) {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 50; i++) {
        const x = ((i * 73) + gameState.frames * 0.1) % W;
        const y = ((i * 37) % 150) + 20;
        const size = (i % 3) + 1;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#f5f5f5';
      ctx.beginPath();
      ctx.arc(W - 80, 60, 30, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(W - 80, 60, 25, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = gameState.isNightMode ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.8)';
    for (const cloud of gameState.clouds) {
      const height = cloud.width * 0.4;
      ctx.beginPath();
      ctx.arc(cloud.x, cloud.y, height * 0.5, 0, Math.PI * 2);
      ctx.arc(cloud.x + cloud.width * 0.3, cloud.y - height * 0.2, height * 0.6, 0, Math.PI * 2);
      ctx.arc(cloud.x + cloud.width * 0.6, cloud.y, height * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = gameState.isNightMode ? '#2d2d2d' : '#e8e8e8';
    ctx.fillRect(0, GAME_CONFIG.GROUND_Y, W, H - GAME_CONFIG.GROUND_Y);

    ctx.strokeStyle = gameState.isNightMode ? '#444' : '#999';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GAME_CONFIG.GROUND_Y);
    ctx.lineTo(W, GAME_CONFIG.GROUND_Y);
    ctx.stroke();

    ctx.fillStyle = gameState.isNightMode ? '#3a3a3a' : '#ccc';
    const groundOffset = (gameState.frames * gameState.speed) % 50;
    for (let x = -groundOffset; x < W; x += 50) {
      ctx.fillRect(x, GAME_CONFIG.GROUND_Y + 10, 3, 3);
      ctx.fillRect(x + 25, GAME_CONFIG.GROUND_Y + 25, 3, 3);
      ctx.fillRect(x + 40, GAME_CONFIG.GROUND_Y + 15, 3, 3);
    }

    for (const obstacle of gameState.obstacles) {
      if (obstacle.type.startsWith('bird')) {
        ctx.fillStyle = gameState.isNightMode ? '#6a6a6a' : '#8B4513';
        const wingFlap = Math.sin(gameState.frames * 0.3) * 8;

        ctx.fillRect(obstacle.x, obstacle.y, 40, 15);

        ctx.beginPath();
        ctx.moveTo(obstacle.x + 5, obstacle.y + 5);
        ctx.lineTo(obstacle.x - 10, obstacle.y - 15 + wingFlap);
        ctx.lineTo(obstacle.x + 15, obstacle.y + 5);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(obstacle.x + 25, obstacle.y + 5);
        ctx.lineTo(obstacle.x + 50, obstacle.y - 15 + wingFlap);
        ctx.lineTo(obstacle.x + 35, obstacle.y + 5);
        ctx.fill();

        ctx.fillStyle = '#D2691E';
        ctx.fillRect(obstacle.x + 40, obstacle.y + 3, 12, 4);
      } else {
        ctx.fillStyle = gameState.isNightMode ? '#2d5a2d' : '#228B22';

        if (obstacle.type === 'cactus_group') {
          ctx.fillRect(obstacle.x, obstacle.y, 20, obstacle.height);
          ctx.fillRect(obstacle.x + 15, obstacle.y + 10, 15, obstacle.height - 10);
          ctx.fillRect(obstacle.x + 35, obstacle.y + 5, 18, obstacle.height - 5);
          ctx.fillRect(obstacle.x + 18, obstacle.y + 12, 8, 4);
          ctx.fillRect(obstacle.x + 30, obstacle.y + 20, 8, 4);
        } else {
          ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
          ctx.fillRect(obstacle.x - 8, obstacle.y + obstacle.height * 0.3, 8, 4);
          ctx.fillRect(obstacle.x - 12, obstacle.y + obstacle.height * 0.3 - 10, 4, 10);
          ctx.fillRect(obstacle.x + obstacle.width, obstacle.y + obstacle.height * 0.5, 8, 4);
          ctx.fillRect(obstacle.x + obstacle.width + 4, obstacle.y + obstacle.height * 0.5 - 8, 4, 8);
        }
      }
    }

    ctx.fillStyle = gameState.isNightMode ? '#555' : '#525252';
    const x = dino.x;
    const y = dino.y;
    const w = dino.width;
    const h = dino.height;

    ctx.fillRect(x, y - h + 20, w, h - 20);
    ctx.fillRect(x + w - 15, y - h - 10, 25, 25);

    ctx.fillStyle = '#fff';
    ctx.fillRect(x + w - 8, y - h - 5, 5, 5);

    ctx.fillStyle = '#000';
    ctx.fillRect(x + w - 5, y - h - 3, 2, 2);

    ctx.fillStyle = gameState.isNightMode ? '#555' : '#525252';

    if (dino.isDucking) {
      ctx.fillRect(x, y - h + 15, w + 15, h - 15);
      ctx.fillRect(x + w + 5, y - h + 5, 15, 15);
    } else if (dino.isJumping) {
      ctx.fillRect(x + 5, y - 15, 8, 15);
      ctx.fillRect(x + w - 15, y - 15, 8, 15);
    } else {
      const legOffset = Math.sin(dino.runFrame) * 8;
      ctx.fillRect(x + 8, y - 15, 6, 15 + legOffset);
      ctx.fillRect(x + w - 16, y - 15, 6, 15 - legOffset);
    }

    ctx.fillRect(x - 15, y - h + 25, 15, 10);
  }, []);

  const handleGameOver = useCallback(async () => {
    const gameState = gameStateRef.current;
    const rewardTier = calculateRewardTier(gameState.survivalTime);

    // Stop game loop first
    gameLoop.stop();

    // Clear the game session from economy so player can play again
    gameEconomy.forceResetSession?.();

    // Update UI to show game over
    setUiState(prev => ({
      ...prev,
      gameStatus: 'gameover',
      currentRewardTier: rewardTier,
      isProcessingPayment: rewardTier > 0,
      rewardClaimed: false,
      rewardTxId: null,
      rewardAmount: 0,
    }));

    // If player earned a reward, verify and claim it
    if (rewardTier > 0 && walletAddress) {
      try {
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const survivalTime = Math.floor(gameState.survivalTime);

        // Call backend to verify survival and get reward
        const response = await fetch('/api/verify-survival', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            walletAddress,
            survivalTime,
          }),
        });

        const result = await response.json();

        if (result.verified && result.rewardAmount > 0) {
          // Trigger balance refresh after reward claim
          _onTx?.(result.sessionId);
          setUiState(prev => ({
            ...prev,
            isProcessingPayment: false,
            lastError: null,
            rewardClaimed: true,
            rewardTxId: result.sessionId,
            rewardAmount: result.rewardAmount,
          }));
        } else {
          setUiState(prev => ({
            ...prev,
            isProcessingPayment: false,
            lastError: result.error || 'No reward earned',
            rewardClaimed: false,
          }));
        }
      } catch (error) {
        console.error('Failed to claim reward:', error);
        setUiState(prev => ({
          ...prev,
          isProcessingPayment: false,
          lastError: 'Failed to claim reward. Contact support.',
          rewardClaimed: false,
        }));
      }
    } else {
      // No reward earned or no wallet
      setUiState(prev => ({
        ...prev,
        isProcessingPayment: false,
        rewardClaimed: false,
        rewardAmount: 0,
      }));
    }
  }, [gameLoop, walletAddress, gameEconomy]);

  /**
   * Start the game - payment confirmed, waiting for first jump
   */
  const startGame = useCallback(async () => {
    if (!walletAddress) {
      onConnect?.();
      return;
    }

    if (!gameEconomy.canPlay) {
      setUiState(prev => ({ ...prev, showEntryFeeModal: true }));
      return;
    }

    const result = await gameEconomy.startGame();

    // Trigger balance refresh after fee payment
    if (result.success && result.sessionId) {
      _onTx?.(`entry_${result.sessionId}`);
    }

    if (!result.success) {
      setUiState(prev => ({
        ...prev,
        showEntryFeeModal: true,
        lastError: result.error || 'Failed to start game'
      }));
      return;
    }

    // Initialize game state
    gameStateRef.current = {
      dino: {
        x: 50,
        y: GAME_CONFIG.GROUND_Y,
        width: 40,
        height: 60,
        velocityY: 0,
        isJumping: false,
        isDucking: false,
        runFrame: 0,
      },
      obstacles: [],
      clouds: [
        { x: 200, y: 80, width: 80, speed: 0.5 },
        { x: 500, y: 60, width: 100, speed: 0.7 },
        { x: 800, y: 90, width: 70, speed: 0.4 },
      ],
      nextObstacleId: 0,
      speed: GAME_CONFIG.BASE_SPEED,
      distance: 0,
      survivalTime: 0,
      isNightMode: false,
      gameOver: false,
      frames: 0,
      checkpointsReached: new Set<number>(),
    };

    // Set status to 'ready' - waiting for first jump
    setUiState(prev => ({
      ...prev,
      gameStatus: 'ready',
      survivalTime: 0,
      speed: GAME_CONFIG.BASE_SPEED,
      score: 0,
      isProcessingPayment: false,
      lastError: null,
      currentRewardTier: 0,
    }));

    // Render initial frame but don't start game loop yet
    renderFrame();
  }, [walletAddress, onConnect, gameEconomy]);

  /**
   * Handle player input
   */
  const handleInput = useCallback((action: 'jump' | 'duck_start' | 'duck_end') => {
    // If ready and jump pressed, start the actual gameplay
    if (uiState.gameStatus === 'ready' && action === 'jump') {
      setUiState(prev => ({ ...prev, gameStatus: 'playing' }));
      gameLoop.start();

      // Apply jump after starting
      const dino = gameStateRef.current.dino;
      if (!dino.isJumping && !dino.isDucking) {
        dino.isJumping = true;
        dino.velocityY = GAME_CONFIG.JUMP_FORCE;
      }
      return;
    }

    if (uiState.gameStatus !== 'playing') return;

    const dino = gameStateRef.current.dino;

    switch (action) {
      case 'jump':
        if (!dino.isJumping && !dino.isDucking) {
          dino.isJumping = true;
          dino.velocityY = GAME_CONFIG.JUMP_FORCE;
        }
        break;
      case 'duck_start':
        if (!dino.isJumping) {
          dino.isDucking = true;
        }
        break;
      case 'duck_end':
        dino.isDucking = false;
        break;
    }
  }, [uiState.gameStatus, gameLoop]);

  // Initialize canvas context and render initial preview scene
  useEffect(() => {
    if (canvasRef.current) {
      ctxRef.current = canvasRef.current.getContext('2d');

      // Render initial preview scene so canvas isn't blank
      const ctx = ctxRef.current;
      if (ctx) {
        const W = GAME_CONFIG.CANVAS_WIDTH;
        const H = GAME_CONFIG.CANVAS_HEIGHT;

        // Sky background
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, W, H);

        // Sun
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(W - 80, 60, 25, 0, Math.PI * 2);
        ctx.fill();

        // Clouds
        const previewClouds = [
          { x: 150, y: 70, width: 80 },
          { x: 400, y: 50, width: 100 },
          { x: 700, y: 85, width: 70 },
          { x: 950, y: 55, width: 90 },
        ];
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        for (const cloud of previewClouds) {
          const height = cloud.width * 0.4;
          ctx.beginPath();
          ctx.arc(cloud.x, cloud.y, height * 0.5, 0, Math.PI * 2);
          ctx.arc(cloud.x + cloud.width * 0.3, cloud.y - height * 0.2, height * 0.6, 0, Math.PI * 2);
          ctx.arc(cloud.x + cloud.width * 0.6, cloud.y, height * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Ground
        ctx.fillStyle = '#e8e8e8';
        ctx.fillRect(0, GAME_CONFIG.GROUND_Y, W, H - GAME_CONFIG.GROUND_Y);

        // Ground line
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, GAME_CONFIG.GROUND_Y);
        ctx.lineTo(W, GAME_CONFIG.GROUND_Y);
        ctx.stroke();

        // Ground details
        ctx.fillStyle = '#ccc';
        for (let x = 0; x < W; x += 50) {
          ctx.fillRect(x, GAME_CONFIG.GROUND_Y + 10, 3, 3);
          ctx.fillRect(x + 25, GAME_CONFIG.GROUND_Y + 25, 3, 3);
          ctx.fillRect(x + 40, GAME_CONFIG.GROUND_Y + 15, 3, 3);
        }

        // Draw Dino standing idle
        const dino = gameStateRef.current.dino;
        const x = dino.x;
        const y = dino.y;
        const w = dino.width;
        const h = dino.height;

        ctx.fillStyle = '#525252';
        // Body
        ctx.fillRect(x, y - h + 20, w, h - 20);
        // Head
        ctx.fillRect(x + w - 15, y - h - 10, 25, 25);
        // Eye
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + w - 8, y - h - 5, 5, 5);
        ctx.fillStyle = '#000';
        ctx.fillRect(x + w - 5, y - h - 3, 2, 2);
        // Legs (standing)
        ctx.fillStyle = '#525252';
        ctx.fillRect(x + 8, y - 15, 6, 15);
        ctx.fillRect(x + w - 16, y - 15, 6, 15);
        // Tail
        ctx.fillRect(x - 15, y - h + 25, 15, 10);

        // Draw some preview cacti
        ctx.fillStyle = '#228B22';
        // Small cactus
        ctx.fillRect(350, GAME_CONFIG.GROUND_Y - 35, 25, 35);
        ctx.fillRect(342, GAME_CONFIG.GROUND_Y - 22, 8, 4);
        ctx.fillRect(338, GAME_CONFIG.GROUND_Y - 32, 4, 10);
        ctx.fillRect(375, GAME_CONFIG.GROUND_Y - 18, 8, 4);
        ctx.fillRect(379, GAME_CONFIG.GROUND_Y - 26, 4, 8);
        // Large cactus
        ctx.fillRect(600, GAME_CONFIG.GROUND_Y - 50, 30, 50);
        ctx.fillRect(592, GAME_CONFIG.GROUND_Y - 35, 8, 4);
        ctx.fillRect(588, GAME_CONFIG.GROUND_Y - 45, 4, 10);
        ctx.fillRect(630, GAME_CONFIG.GROUND_Y - 25, 8, 4);
        ctx.fillRect(634, GAME_CONFIG.GROUND_Y - 33, 4, 8);
        // Cactus group
        ctx.fillRect(850, GAME_CONFIG.GROUND_Y - 35, 20, 35);
        ctx.fillRect(865, GAME_CONFIG.GROUND_Y - 25, 15, 25);
        ctx.fillRect(885, GAME_CONFIG.GROUND_Y - 30, 18, 30);

        // "Press Start" text overlay
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(W / 2 - 160, H / 2 - 30, 320, 60);
        ctx.fillStyle = '#525252';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🦕  Press Start Game to Play!', W / 2, H / 2);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      }
    }
  }, []);

  // Setup keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
        case ' ':
          e.preventDefault();
          handleInput('jump');
          break;
        case 'ArrowDown':
          e.preventDefault();
          handleInput('duck_start');
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          handleInput('duck_end');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleInput]);

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get reward tier display text
  const getRewardTierText = (tier: number): string => {
    switch (tier) {
      case 3: return ' 1000 CKB';
      case 2: return ' 500 CKB';
      case 1: return ' 200 CKB';
      default: return 'Survive 1 min for reward';
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/20 border border-green-500/30 text-xs font-bold text-green-400 mb-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
          SURVIVAL REWARDS
        </div>
        <h2 className="text-4xl md:text-5xl font-black text-white italic tracking-tight drop-shadow-2xl pr-2">
          CKB <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-emerald-400 to-green-400">DINO RUN</span>
        </h2>
        <p className="text-gray-400 text-lg">Run, jump, survive & win CKB rewards!</p>
      </div>

      <div className="flex gap-4 text-sm text-gray-300 bg-gray-800 px-4 py-2 rounded-lg">
        <div>1 min = 200 CKB</div>
        <div>5 min = 500 CKB</div>
        <div>10 min = 1000 CKB</div>
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          width={GAME_CONFIG.CANVAS_WIDTH}
          height={GAME_CONFIG.CANVAS_HEIGHT}
          className="border border-gray-600 rounded-lg"
          style={{ maxWidth: '100%', height: 'auto' }}
        />

        <div className="absolute top-4 right-4 text-right font-mono">
          <div className="text-2xl font-bold text-gray-700">
            {formatTime(uiState.survivalTime)}
          </div>
          <div className="text-sm text-gray-500">
            Score: {uiState.score}
          </div>
          <div className="text-sm text-gray-500">
            Speed: {uiState.speed.toFixed(1)}x
          </div>
          <div className={`text-sm font-bold mt-2 ${uiState.currentRewardTier > 0 ? 'text-green-600' : 'text-gray-400'}`}>
            {getRewardTierText(uiState.currentRewardTier)}
          </div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap justify-center">
        {uiState.gameStatus === 'idle' && (
          <>
            <button
              onClick={startGame}
              disabled={!walletAddress || gameEconomy.isProcessing}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {gameEconomy.isProcessing ? 'Processing...' : `Start Game (${GAME_CONFIG.ENTRY_FEE_CKB} CKB)`}
            </button>
            <button
              onClick={() => {
                gameEconomy.forceResetSession?.();
                setUiState(prev => ({ ...prev, lastError: null }));
              }}
              className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
            >
              Reset Session
            </button>
          </>
        )}

        {uiState.gameStatus === 'ready' && (
          <div className="flex flex-col items-center gap-3">
            <div className="text-xl font-bold text-green-400">
              Payment Confirmed!
            </div>
            <div className="text-xl font-bold text-yellow-400">
              Click the Jump button to start the game
            </div>
            <div className="text-gray-400 text-sm">
              Space/↑ = Jump | ↓ = Duck
            </div>
          </div>
        )}

        {uiState.gameStatus === 'playing' && (
          <>
            <button
              onClick={() => gameLoop.pause()}
              className="px-6 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
            >
              Pause
            </button>
            <div className="text-gray-400 text-sm flex items-center">
              Space/↑ = Jump | ↓ = Duck
            </div>
          </>
        )}

        {uiState.gameStatus === 'paused' && (
          <button
            onClick={() => gameLoop.resume()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Resume
          </button>
        )}

        {uiState.gameStatus === 'gameover' && (
          <div className="flex flex-col items-center gap-3">
            {/* Game Over Result */}
            <div className="text-center mb-2">
              {uiState.currentRewardTier > 0 ? (
                <>
                  <div className="text-2xl font-bold text-green-500">YOU WON!</div>
                  {uiState.isProcessingPayment ? (
                    <div className="text-yellow-400 mt-2">Processing reward...</div>
                  ) : uiState.rewardClaimed ? (
                    <>
                      <div className="text-lg text-green-400 mt-1">
                        +{uiState.rewardAmount} CKB earned!
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Session: {uiState.rewardTxId?.slice(0, 20)}...
                      </div>
                    </>
                  ) : (
                    <div className="text-red-400 mt-2">{uiState.lastError || 'Failed to claim'}</div>
                  )}
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold text-red-500">GAME OVER</div>
                  <div className="text-gray-400 mt-1">Survive 1 min to earn CKB</div>
                </>
              )}
            </div>

            <button
              onClick={() => {
                // Reset session and go to idle state for fresh payment
                gameEconomy.forceResetSession?.();
                setUiState(prev => ({
                  ...prev,
                  gameStatus: 'idle',
                  lastError: null,
                  isProcessingPayment: false,
                }));
              }}
              disabled={uiState.isProcessingPayment}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {uiState.isProcessingPayment ? 'Processing...' : 'Play Again'}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 md:hidden w-full max-w-xs">
        <button
          onTouchStart={() => handleInput('jump')}
          onMouseDown={() => handleInput('jump')}
          className="p-4 bg-gray-700 text-white rounded-lg active:bg-gray-600"
        >
          Jump (Space)
        </button>
        <button
          onTouchStart={() => handleInput('duck_start')}
          onTouchEnd={() => handleInput('duck_end')}
          onMouseDown={() => handleInput('duck_start')}
          onMouseUp={() => handleInput('duck_end')}
          className="p-4 bg-gray-700 text-white rounded-lg active:bg-gray-600"
        >
          Duck (↓)
        </button>
      </div>
    </div>
  );
};

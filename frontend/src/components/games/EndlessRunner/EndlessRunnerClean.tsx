import React, { useEffect, useRef, useCallback, useState } from 'react';
import { ccc } from '@ckb-ccc/connector-react';
import { useGameLoop } from './engine/GameEngine';
import { useGameEconomy } from './systems/useGameEconomy';

interface EndlessRunnerProps {
  gameAddress: string;
  walletAddress?: string;
  onConnect?: () => void;
  signer?: ReturnType<typeof ccc.useSigner> | null;
  onTx?: (txHash: string) => void;
  onWin: (winner: string) => void;
}

const GAME_CONFIG = {
  ENTRY_FEE_CKB: 200,
  CANVAS_WIDTH: 1200,
  CANVAS_HEIGHT: 400,
  GROUND_Y: 320,
  GRAVITY: 0.6,
  JUMP_FORCE: -12,
  BASE_SPEED: 6,
  MAX_SPEED: 15,
  SPEED_INCREMENT: 0.1,
  SPEED_INCREASE_INTERVAL: 600,
  REWARD_TIERS: {
    TIER_1: { time: 60, reward: 100 },
    TIER_2: { time: 300, reward: 500 },
    TIER_3: { time: 600, reward: 1000 },
  },
} as const;

interface Obstacle {
  id: string;
  type: 'cactus_small' | 'cactus_large' | 'cactus_group' | 'bird_low' | 'bird_mid' | 'bird_high';
  x: number;
  y: number;
  width: number;
  height: number;
  passed: boolean;
}

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

interface Cloud {
  x: number;
  y: number;
  width: number;
  speed: number;
}

export const EndlessRunner: React.FC<EndlessRunnerProps> = ({
  gameAddress: _gameAddress,
  walletAddress,
  onConnect,
  signer,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [uiState, setUiState] = useState({
    gameStatus: 'idle' as 'idle' | 'playing' | 'paused' | 'gameover',
    survivalTime: 0,
    speed: GAME_CONFIG.BASE_SPEED as number,
    score: 0,
    currentRewardTier: 0,
  });

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
    clouds: [
      { x: 200, y: 80, width: 80, speed: 0.5 },
      { x: 500, y: 60, width: 100, speed: 0.7 },
      { x: 800, y: 90, width: 70, speed: 0.4 },
    ] as Cloud[],
    nextObstacleId: 0,
    speed: GAME_CONFIG.BASE_SPEED as number,
    distance: 0,
    survivalTime: 0,
    isNightMode: false,
    gameOver: false,
    frames: 0,
  });

  const gameStatusRef = useRef(uiState.gameStatus);
  useEffect(() => {
    gameStatusRef.current = uiState.gameStatus;
  }, [uiState.gameStatus]);

  const gameEconomy = useGameEconomy(_gameAddress, signer);

  const gameLoop = useGameLoop({
    onFrame: handleGameFrame,
    targetFPS: 60,
    autoStart: false,
  });

  function handleGameFrame(_deltaTime: number, _gameTime: number) {
    if (gameStatusRef.current !== 'playing') return;

    const gameState = gameStateRef.current;
    if (gameState.gameOver) {
      handleGameOver();
      return;
    }

    gameState.frames++;
    gameState.survivalTime += 1 / 60;

    if (gameState.frames % (GAME_CONFIG.SPEED_INCREASE_INTERVAL as number) === 0) {
      gameState.speed = Math.min(GAME_CONFIG.MAX_SPEED as number, gameState.speed + (GAME_CONFIG.SPEED_INCREMENT as number));
    }

    if (gameState.frames % 600 === 0) {
      gameState.isNightMode = !gameState.isNightMode;
    }

    updateDino();
    updateObstacles();
    updateClouds();
    spawnObstacles();
    spawnClouds();
    checkCollisions();

    if (gameState.frames % 10 === 0) {
      const rewardTier = calculateRewardTier(gameState.survivalTime);
      setUiState(prev => ({
        ...prev,
        survivalTime: Math.floor(gameState.survivalTime),
        speed: Math.floor(gameState.speed * 10) / 10,
        score: Math.floor(gameState.distance / 10),
        currentRewardTier: rewardTier,
      }));
    }

    renderFrame();
  }

  function updateDino() {
    const dino = gameStateRef.current.dino;

    if (dino.isJumping) {
      dino.velocityY += GAME_CONFIG.GRAVITY;
      dino.y += dino.velocityY;

      if (dino.y >= GAME_CONFIG.GROUND_Y) {
        dino.y = GAME_CONFIG.GROUND_Y;
        dino.velocityY = 0;
        dino.isJumping = false;
      }
    }

    if (!dino.isJumping && !dino.isDucking) {
      gameStateRef.current.dino.runFrame += 0.2;
    }

    if (dino.isDucking) {
      dino.height = 35;
      dino.y = GAME_CONFIG.GROUND_Y + 25;
    } else {
      dino.height = 60;
      dino.y = Math.min(dino.y, GAME_CONFIG.GROUND_Y);
    }
  }

  function spawnObstacles() {
    const gameState = gameStateRef.current;
    const minGap = 250 + Math.random() * 150;
    const lastObstacle = gameState.obstacles[gameState.obstacles.length - 1];

    if (!lastObstacle || (GAME_CONFIG.CANVAS_WIDTH - lastObstacle.x) > minGap) {
      if (Math.random() < 0.02 + gameState.speed * 0.002) {
        const obstacle = createObstacle();
        gameState.obstacles.push(obstacle);
      }
    }
  }

  function createObstacle(): Obstacle {
    const gameState = gameStateRef.current;
    const id = `obs_${gameState.nextObstacleId++}`;

    const types: Obstacle['type'][] = ['cactus_small', 'cactus_large', 'cactus_group'];

    if (gameState.survivalTime > 30) {
      types.push('bird_low', 'bird_mid', 'bird_high');
    }

    const type = types[Math.floor(Math.random() * types.length)];

    switch (type) {
      case 'cactus_small':
        return { id, type, x: GAME_CONFIG.CANVAS_WIDTH, y: GAME_CONFIG.GROUND_Y - 35, width: 25, height: 35, passed: false };
      case 'cactus_large':
        return { id, type, x: GAME_CONFIG.CANVAS_WIDTH, y: GAME_CONFIG.GROUND_Y - 50, width: 30, height: 50, passed: false };
      case 'cactus_group':
        return { id, type, x: GAME_CONFIG.CANVAS_WIDTH, y: GAME_CONFIG.GROUND_Y - 35, width: 70, height: 35, passed: false };
      case 'bird_low':
        return { id, type, x: GAME_CONFIG.CANVAS_WIDTH, y: GAME_CONFIG.GROUND_Y - 35, width: 40, height: 30, passed: false };
      case 'bird_mid':
        return { id, type, x: GAME_CONFIG.CANVAS_WIDTH, y: GAME_CONFIG.GROUND_Y - 85, width: 40, height: 30, passed: false };
      case 'bird_high':
        return { id, type, x: GAME_CONFIG.CANVAS_WIDTH, y: GAME_CONFIG.GROUND_Y - 120, width: 40, height: 30, passed: false };
      default:
        return { id, type: 'cactus_small', x: GAME_CONFIG.CANVAS_WIDTH, y: GAME_CONFIG.GROUND_Y - 35, width: 25, height: 35, passed: false };
    }
  }

  function updateObstacles() {
    const gameState = gameStateRef.current;

    for (const obstacle of gameState.obstacles) {
      obstacle.x -= gameState.speed;

      if (!obstacle.passed && obstacle.x + obstacle.width < gameState.dino.x) {
        obstacle.passed = true;
        gameState.distance += 10;
      }
    }

    gameState.obstacles = gameState.obstacles.filter(obs => obs.x + obs.width > -50);
  }

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

  function updateClouds() {
    const gameState = gameStateRef.current;

    for (const cloud of gameState.clouds) {
      cloud.x -= cloud.speed;
    }

    gameState.clouds = gameState.clouds.filter(cloud => cloud.x + cloud.width > -50);
  }

  function checkCollisions() {
    const gameState = gameStateRef.current;
    const dino = gameState.dino;

    const dinoHitbox = {
      x: dino.x + 5,
      y: dino.y + 5,
      width: dino.width - 10,
      height: dino.height - 10,
    };

    for (const obstacle of gameState.obstacles) {
      const obsHitbox = {
        x: obstacle.x + 3,
        y: obstacle.y + 3,
        width: obstacle.width - 6,
        height: obstacle.height - 6,
      };

      if (
        dinoHitbox.x < obsHitbox.x + obsHitbox.width &&
        dinoHitbox.x + dinoHitbox.width > obsHitbox.x &&
        dinoHitbox.y < obsHitbox.y + obsHitbox.height &&
        dinoHitbox.y + dinoHitbox.height > obsHitbox.y
      ) {
        gameState.gameOver = true;
        return;
      }
    }
  }

  function calculateRewardTier(survivalTime: number): number {
    if (survivalTime >= GAME_CONFIG.REWARD_TIERS.TIER_3.time) return 3;
    if (survivalTime >= GAME_CONFIG.REWARD_TIERS.TIER_2.time) return 2;
    if (survivalTime >= GAME_CONFIG.REWARD_TIERS.TIER_1.time) return 1;
    return 0;
  }

  function getRewardForTier(tier: number): number {
    switch (tier) {
      case 3: return GAME_CONFIG.REWARD_TIERS.TIER_3.reward;
      case 2: return GAME_CONFIG.REWARD_TIERS.TIER_2.reward;
      case 1: return GAME_CONFIG.REWARD_TIERS.TIER_1.reward;
      default: return 0;
    }
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

  const handleGameOver = useCallback(() => {
    const gameState = gameStateRef.current;
    const rewardTier = calculateRewardTier(gameState.survivalTime);

    setUiState(prev => ({
      ...prev,
      gameStatus: 'gameover',
      currentRewardTier: rewardTier,
    }));

    gameLoop.stop();
  }, [gameLoop]);

  const startGame = useCallback(async () => {
    if (!walletAddress) {
      onConnect?.();
      return;
    }

    if (!gameEconomy.canPlay) {
      return;
    }

    const result = await gameEconomy.startGame();

    if (!result.success) {
      return;
    }

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
    };

    setUiState(prev => ({
      ...prev,
      gameStatus: 'playing',
      survivalTime: 0,
      speed: GAME_CONFIG.BASE_SPEED,
      score: 0,
      currentRewardTier: 0,
    }));

    gameLoop.start();
  }, [walletAddress, onConnect, gameEconomy, gameLoop]);

  const handleInput = useCallback((action: 'jump' | 'duck_start' | 'duck_end') => {
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
  }, [uiState.gameStatus]);

  useEffect(() => {
    if (canvasRef.current) {
      ctxRef.current = canvasRef.current.getContext('2d');
    }
  }, []);

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

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getRewardTierText = (tier: number): string => {
    switch (tier) {
      case 3: return '🏆 1000 CKB';
      case 2: return '🥈 500 CKB';
      case 1: return '🥉 100 CKB';
      default: return 'Survive 1 min for reward';
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">CKB Dino Run</h2>
        <p className="text-gray-400">Survive to earn CKB rewards!</p>
      </div>

      <div className="flex gap-4 text-sm text-gray-300 bg-gray-800 px-4 py-2 rounded-lg">
        <div>🥉 1 min = 100 CKB</div>
        <div>🥈 5 min = 500 CKB</div>
        <div>🏆 10 min = 1000 CKB</div>
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
              }}
              className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
            >
              Reset Session
            </button>
          </>
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
          <>
            <button
              onClick={startGame}
              disabled={gameEconomy.isProcessing}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {gameEconomy.isProcessing ? 'Processing...' : 'Play Again'}
            </button>
            <button
              onClick={() => setUiState(prev => ({ ...prev, gameStatus: 'idle' }))}
              className="px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              Back to Menu
            </button>
          </>
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

      {uiState.gameStatus === 'gameover' && uiState.currentRewardTier > 0 && (
        <div className="bg-green-800 p-4 rounded-lg text-center">
          <p className="text-green-400 font-bold">🎉 Reward Earned: {getRewardForTier(uiState.currentRewardTier)} CKB</p>
        </div>
      )}
    </div>
  );
};

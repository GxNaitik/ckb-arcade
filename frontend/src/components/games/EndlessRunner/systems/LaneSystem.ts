/**
 * Lane system configuration and types
 */
export interface LaneConfig {
  id: number;
  x: number; // World X position
  width: number;
  centerX: number;
}

export interface TrackSegment {
  id: string;
  z: number; // Depth position
  type: 'straight' | 'curve_left' | 'curve_right' | 'ramp' | 'tunnel';
  length: number;
  obstacles: ObstacleInstance[];
  coins: CoinInstance[];
  isActive: boolean;
}

export interface ObstacleInstance {
  id: string;
  type: 'train' | 'barrier' | 'tunnel' | 'ramp' | 'moving_barrier' | 'low_tunnel';
  lane: number;
  z: number; // Relative to segment
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  color: string;
  isStatic: boolean;
  speed?: number;
  canJumpOver: boolean;
  canSlideUnder: boolean;
  damage: number;
  spawnWeight: number;
  minDifficulty: number;
}

export interface CoinInstance {
  id: string;
  lane: number;
  z: number; // Relative to segment
  x: number;
  y: number;
  value: number;
  pattern?: 'single' | 'trail' | 'cluster' | 'zigzag' | 'rainbow';
  patternIndex?: number;
  collected: boolean;
  spawnTime: number;
}

/**
 * Obstacle type configurations
 */
export interface ObstacleType {
  id: string;
  name: string;
  width: number;
  height: number;
  depth: number;
  color: string;
  isStatic: boolean;
  speed?: number;
  canJumpOver: boolean;
  canSlideUnder: boolean;
  damage: number;
  spawnWeight: number;
  minDifficulty: number;
}

export const OBSTACLE_TYPES: Record<string, ObstacleType> = {
  barrier: {
    id: 'barrier',
    name: 'Barrier',
    width: 80,
    height: 60,
    depth: 40,
    color: '#ff4444',
    isStatic: true,
    canJumpOver: true,
    canSlideUnder: false,
    damage: 1,
    spawnWeight: 10,
    minDifficulty: 1.0,
  },
  train: {
    id: 'train',
    name: 'Train',
    width: 120,
    height: 100,
    depth: 200,
    color: '#8B4513',
    isStatic: false,
    speed: 5,
    canJumpOver: false,
    canSlideUnder: false,
    damage: 1,
    spawnWeight: 8,
    minDifficulty: 1.2,
  },
  tunnel: {
    id: 'tunnel',
    name: 'Tunnel',
    width: 100,
    height: 150,
    depth: 80,
    color: '#666',
    isStatic: true,
    canJumpOver: false,
    canSlideUnder: true,
    damage: 1,
    spawnWeight: 6,
    minDifficulty: 1.5,
  },
  ramp: {
    id: 'ramp',
    name: 'Ramp',
    width: 90,
    height: 40,
    depth: 120,
    color: '#FFA500',
    isStatic: true,
    canJumpOver: true,
    canSlideUnder: true,
    damage: 0,
    spawnWeight: 4,
    minDifficulty: 1.8,
  },
  moving_barrier: {
    id: 'moving_barrier',
    name: 'Moving Barrier',
    width: 70,
    height: 80,
    depth: 40,
    color: '#ff6b6b',
    isStatic: false,
    speed: 3,
    canJumpOver: true,
    canSlideUnder: false,
    damage: 1,
    spawnWeight: 5,
    minDifficulty: 2.0,
  },
  low_tunnel: {
    id: 'low_tunnel',
    name: 'Low Tunnel',
    width: 110,
    height: 80,
    depth: 60,
    color: '#444',
    isStatic: true,
    canJumpOver: true,
    canSlideUnder: true,
    damage: 1,
    spawnWeight: 7,
    minDifficulty: 1.3,
  },
};

/**
 * CKB Coin System Configuration
 */
export interface CoinPattern {
  id: string;
  name: string;
  coinCount: number;
  spacing: number;
  lanes: number[];
  difficulty: number;
  probability: number; // Spawn probability (0-1)
}

export const COIN_PATTERNS: Record<string, CoinPattern> = {
  single: {
    id: 'single',
    name: 'Single Coin',
    coinCount: 1,
    spacing: 0,
    lanes: [0, 1, 2],
    difficulty: 1.0,
    probability: 0.4,
  },
  trail: {
    id: 'trail',
    name: 'Coin Trail',
    coinCount: 5,
    spacing: 80,
    lanes: [0, 1, 2],
    difficulty: 1.2,
    probability: 0.3,
  },
  cluster: {
    id: 'cluster',
    name: 'Coin Cluster',
    coinCount: 7,
    spacing: 40,
    lanes: [0, 1, 2],
    difficulty: 1.5,
    probability: 0.2,
  },
  zigzag: {
    id: 'zigzag',
    name: 'Zigzag Pattern',
    coinCount: 9,
    spacing: 100,
    lanes: [0, 1, 2],
    difficulty: 1.8,
    probability: 0.15,
  },
  rainbow: {
    id: 'rainbow',
    name: 'Rainbow Arc',
    coinCount: 11,
    spacing: 60,
    lanes: [0, 1, 2],
    difficulty: 2.0,
    probability: 0.1,
  },
};

/**
 * Deterministic Coin Spawner
 * Uses seeded random generation for anti-cheat
 */
export class DeterministicCoinSpawner {
  private seed: number;
  private nextCoinId: number;

  constructor(seed: number = 0) {
    this.seed = seed;
    this.nextCoinId = 0;
  }

  /**
   * Seeded random number generator (same seed = same results)
   */
  private seededRandom(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  /**
   * Select coin pattern based on difficulty and deterministic random
   */
  selectPattern(difficulty: number): CoinPattern {
    const availablePatterns = Object.values(COIN_PATTERNS).filter(
      pattern => pattern.difficulty <= difficulty
    );

    if (availablePatterns.length === 0) {
      return COIN_PATTERNS.single;
    }

    // Weighted selection based on probability
    const totalProbability = availablePatterns.reduce((sum, pattern) => sum + pattern.probability, 0);
    let random = this.seededRandom() * totalProbability;

    for (const pattern of availablePatterns) {
      random -= pattern.probability;
      if (random <= 0) {
        return pattern;
      }
    }

    return availablePatterns[availablePatterns.length - 1];
  }

  /**
   * Generate coin pattern with deterministic positioning
   */
  generatePattern(
    pattern: CoinPattern,
    startZ: number,
    segmentLength: number,
    currentTime: number
  ): CoinInstance[] {
    const coins: CoinInstance[] = [];
    const startOffset = 50 + (segmentLength - 100) * this.seededRandom();
    
    for (let i = 0; i < pattern.coinCount; i++) {
      let laneIndex = this.seededRandom() * pattern.lanes.length;
      let lane = pattern.lanes[Math.floor(laneIndex)];
      
      let z = startZ + startOffset + (i * pattern.spacing);
      let x = 0; // Will be set by lane system
      let y = -20 + this.seededRandom() * 40; // Random height

      // Pattern-specific positioning
      switch (pattern.id) {
        case 'trail':
          // Straight line in same lane
          x = 0; // Lane system will set this
          break;
        
        case 'cluster':
          // Tight group with slight variations
          x = (this.seededRandom() - 0.5) * 30;
          y = -10 + this.seededRandom() * 20;
          break;
        
        case 'zigzag':
          // Alternating lanes
          lane = pattern.lanes[i % pattern.lanes.length];
          x = 0; // Lane system will set this
          break;
        
        case 'rainbow':
          // Arc pattern with height variation
          const arcProgress = i / pattern.coinCount;
          y = -50 + Math.sin(arcProgress * Math.PI) * 30;
          x = (this.seededRandom() - 0.5) * 20;
          break;
      }

      const coin: CoinInstance = {
        id: `ckb_coin_${this.nextCoinId++}`,
        lane,
        z,
        x,
        y,
        value: 10, // Each CKB coin worth 10 points
        pattern: pattern.id as any,
        patternIndex: i,
        collected: false,
        spawnTime: currentTime,
      };

      coins.push(coin);
    }

    return coins;
  }

  /**
   * Update seed for next segment (ensures different patterns per segment)
   */
  updateSeed(segmentId: string): void {
    // Generate new seed from segment ID
    let hash = 0;
    for (let i = 0; i < segmentId.length; i++) {
      const char = segmentId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    this.seed = Math.abs(hash);
  }
}

/**
 * Lane Manager - Handles three-lane system
 */
export class LaneManager {
  private lanes: LaneConfig[];
  private laneWidth: number;

  constructor(laneWidth: number = 200) {
    this.laneWidth = laneWidth;
    this.lanes = this.initializeLanes();
  }

  /**
   * Initialize three lanes
   */
  private initializeLanes(): LaneConfig[] {
    return [
      {
        id: 0, // Left lane
        x: -this.laneWidth,
        width: this.laneWidth,
        centerX: -this.laneWidth / 2,
      },
      {
        id: 1, // Middle lane
        x: 0,
        width: this.laneWidth,
        centerX: 0,
      },
      {
        id: 2, // Right lane
        x: this.laneWidth,
        width: this.laneWidth,
        centerX: this.laneWidth / 2,
      },
    ];
  }

  /**
   * Get lane configuration by ID
   */
  getLane(laneId: number): LaneConfig | undefined {
    return this.lanes.find(lane => lane.id === laneId);
  }

  /**
   * Get all lanes
   */
  getAllLanes(): LaneConfig[] {
    return [...this.lanes];
  }

  /**
   * Get world X position for a lane
   */
  getLaneX(laneId: number): number {
    const lane = this.getLane(laneId);
    return lane ? lane.centerX : 0;
  }

  /**
   * Check if a position is within lane bounds
   */
  isPositionInLane(x: number, laneId: number): boolean {
    const lane = this.getLane(laneId);
    if (!lane) return false;
    
    const halfWidth = lane.width / 2;
    return x >= lane.centerX - halfWidth && x <= lane.centerX + halfWidth;
  }

  /**
   * Get lane ID from world X position
   */
  getLaneFromPosition(x: number): number {
    for (const lane of this.lanes) {
      if (this.isPositionInLane(x, lane.id)) {
        return lane.id;
      }
    }
    return 1; // Default to middle lane
  }
}

/**
 * Track Segment Pool - Object pooling for performance
 * 
 * Why object pooling is critical:
 * - Creating/destroying objects in game loop causes garbage collection spikes
 * - GC spikes cause frame drops and stuttering
 * - Pooling reuses objects instead of creating new ones
 * - Essential for smooth 60 FPS on mobile devices
 */
export class TrackSegmentPool {
  private pool: TrackSegment[];
  private activeSegments: TrackSegment[];
  private nextId: number;

  constructor(initialSize: number = 20) {
    this.pool = [];
    this.activeSegments = [];
    this.nextId = 0;
    this.initializePool(initialSize);
  }

  /**
   * Initialize pool with track segments
   */
  private initializePool(size: number): void {
    for (let i = 0; i < size; i++) {
      const segment: TrackSegment = {
        id: `segment_${this.nextId++}`,
        z: 0,
        type: 'straight',
        length: 500,
        obstacles: [],
        coins: [],
        isActive: false,
      };
      this.pool.push(segment);
    }
  }

  /**
   * Get a track segment from pool
   */
  acquire(): TrackSegment {
    let segment = this.pool.pop();
    
    // If pool is empty, create new segment
    if (!segment) {
      segment = {
        id: `segment_${this.nextId++}`,
        z: 0,
        type: 'straight',
        length: 500,
        obstacles: [],
        coins: [],
        isActive: false,
      };
    }

    // Reset segment state
    segment.isActive = true;
    segment.obstacles = [];
    segment.coins = [];
    
    this.activeSegments.push(segment);
    return segment;
  }

  /**
   * Return track segment to pool
   */
  release(segment: TrackSegment): void {
    const index = this.activeSegments.indexOf(segment);
    if (index > -1) {
      this.activeSegments.splice(index, 1);
      
      // Reset segment
      segment.isActive = false;
      segment.z = 0;
      segment.obstacles = [];
      segment.coins = [];
      
      this.pool.push(segment);
    }
  }

  /**
   * Get all active segments
   */
  getActiveSegments(): TrackSegment[] {
    return [...this.activeSegments];
  }

  /**
   * Release segments that are too far behind
   */
  releaseBehindSegments(playerZ: number, maxDistance: number = 2000): void {
    const segmentsToRelease: TrackSegment[] = [];
    
    for (const segment of this.activeSegments) {
      if (segment.z < playerZ - maxDistance) {
        segmentsToRelease.push(segment);
      }
    }

    for (const segment of segmentsToRelease) {
      this.release(segment);
    }
  }
}

/**
 * Track Spawner - Manages infinite track generation
 */
export class TrackSpawner {
  private laneManager: LaneManager;
  private segmentPool: TrackSegmentPool;
  private segmentLength: number;
  private spawnDistance: number;
  private lastSpawnZ: number;
  private difficulty: number;
  private nextObstacleId: number;
  private coinSpawner: DeterministicCoinSpawner;

  constructor(laneManager: LaneManager) {
    this.laneManager = laneManager;
    this.segmentPool = new TrackSegmentPool(20);
    this.segmentLength = 500;
    this.spawnDistance = 1500; // Spawn segments 1500 units ahead
    this.lastSpawnZ = 0;
    this.difficulty = 1.0;
    this.nextObstacleId = 0;
    this.coinSpawner = new DeterministicCoinSpawner(Date.now());
  }

  /**
   * Calculate current difficulty based on distance and time
   * 
   * Difficulty scaling formula:
   * difficulty = 1.0 + (distance / 10000) * 0.5 + (time / 30000) * 0.3
   * - Distance component: 0.5x increase every 10k units
   * - Time component: 0.3x increase every 30 seconds
   * - Max difficulty: 3.0x
   */
  calculateDifficulty(distance: number, time: number): number {
    const distanceComponent = (distance / 10000) * 0.5;
    const timeComponent = (time / 30000) * 0.3;
    const difficulty = 1.0 + distanceComponent + timeComponent;
    
    return Math.min(difficulty, 3.0); // Cap at 3x difficulty
  }

  /**
   * Get available obstacle types for current difficulty
   */
  getAvailableObstacleTypes(difficulty: number): ObstacleType[] {
    return Object.values(OBSTACLE_TYPES).filter(
      type => type.minDifficulty <= difficulty
    );
  }

  /**
   * Select obstacle type based on weighted random selection
   */
  selectObstacleType(difficulty: number): ObstacleType {
    const availableTypes = this.getAvailableObstacleTypes(difficulty);
    
    if (availableTypes.length === 0) {
      return OBSTACLE_TYPES.barrier; // Fallback
    }

    // Calculate total weight
    const totalWeight = availableTypes.reduce((sum, type) => sum + type.spawnWeight, 0);
    
    // Weighted random selection
    let random = Math.random() * totalWeight;
    
    for (const type of availableTypes) {
      random -= type.spawnWeight;
      if (random <= 0) {
        return type;
      }
    }
    
    return availableTypes[availableTypes.length - 1]; // Fallback
  }

  /**
   * Update track spawning based on player position
   */
  update(playerZ: number, speed: number, gameTime: number = 0): void {
    // Update difficulty based on distance and time
    this.difficulty = this.calculateDifficulty(playerZ, gameTime);

    // Spawn new segments if needed
    while (this.lastSpawnZ < playerZ + this.spawnDistance) {
      this.spawnSegment(this.lastSpawnZ);
      this.lastSpawnZ += this.segmentLength;
    }

    // Release old segments
    this.segmentPool.releaseBehindSegments(playerZ);

    // Update active segments
    this.updateActiveSegments(speed);
  }

  /**
   * Spawn a single track segment
   */
  private spawnSegment(z: number): void {
    const segment = this.segmentPool.acquire();
    segment.z = z;
    
    // Determine segment type based on difficulty
    const rand = Math.random();
    if (this.difficulty > 2.0 && rand < 0.1) {
      segment.type = 'curve_left';
    } else if (this.difficulty > 2.0 && rand < 0.2) {
      segment.type = 'curve_right';
    } else if (this.difficulty > 1.5 && rand < 0.15) {
      segment.type = 'ramp';
    } else if (this.difficulty > 1.3 && rand < 0.1) {
      segment.type = 'tunnel';
    } else {
      segment.type = 'straight';
    }

    // Generate obstacles and coins for this segment
    this.generateSegmentContent(segment);
  }

  /**
   * Generate obstacles and coins for a segment
   */
  private generateSegmentContent(segment: TrackSegment): void {
    // Calculate spawn rate based on difficulty
    const spawnInterval = Math.max(
      500, // Minimum 500ms between spawns
      2000 / this.difficulty // Base 2 seconds, divided by difficulty
    );
    
    // Calculate max obstacles for this segment
    const maxObstacles = Math.min(
      5, // Max 5 obstacles per segment
      Math.floor(segment.length / spawnInterval)
    );
    
    // Generate obstacles
    let currentZ = 100; // Start 100 units into segment
    
    while (currentZ < segment.length - 100 && segment.obstacles.length < maxObstacles) {
      // Decide if we should spawn an obstacle at this position
      if (Math.random() < 0.7) { // 70% chance to spawn
        const obstacle = this.createObstacle(segment.z + currentZ);
        if (obstacle) {
          segment.obstacles.push(obstacle);
        }
      }
      
      currentZ += spawnInterval + Math.random() * 200; // Add some randomness
    }

    // Generate CKB coins using deterministic patterns
    this.coinSpawner.updateSeed(segment.id); // Ensure unique pattern per segment
    
    // Select pattern based on difficulty
    const selectedPattern = this.coinSpawner.selectPattern(this.difficulty);
    
    // Generate coin pattern
    const currentTime = Date.now();
    const patternCoins = this.coinSpawner.generatePattern(
      selectedPattern,
      segment.z,
      segment.length,
      currentTime
    );
    
    // Update coin positions based on lane system
    for (const coin of patternCoins) {
      coin.x = this.laneManager.getLaneX(coin.lane) + coin.x;
      coin.z = segment.z + (coin.z - segment.z); // Adjust relative to segment
      
      // Special handling for zigzag pattern
      if (selectedPattern.id === 'zigzag') {
        coin.lane = selectedPattern.lanes[coin.patternIndex! % selectedPattern.lanes.length];
        coin.x = this.laneManager.getLaneX(coin.lane);
      }
      
      segment.coins.push(coin);
    }
  }

  /**
   * Create a single obstacle
   */
  private createObstacle(z: number): ObstacleInstance | null {
    const obstacleType = this.selectObstacleType(this.difficulty);
    const lane = Math.floor(Math.random() * 3);
    const laneX = this.laneManager.getLaneX(lane);
    
    // Add some lateral randomness within lane
    const lateralOffset = (Math.random() - 0.5) * 30;
    const x = laneX + lateralOffset;
    
    const obstacle: ObstacleInstance = {
      id: `obstacle_${this.nextObstacleId++}`,
      type: obstacleType.id as any,
      lane,
      z,
      x,
      y: 0,
      width: obstacleType.width,
      height: obstacleType.height,
      depth: obstacleType.depth,
      color: obstacleType.color,
      isStatic: obstacleType.isStatic,
      speed: obstacleType.speed,
      canJumpOver: obstacleType.canJumpOver,
      canSlideUnder: obstacleType.canSlideUnder,
      damage: obstacleType.damage,
      spawnWeight: obstacleType.spawnWeight,
      minDifficulty: obstacleType.minDifficulty,
    };
    
    return obstacle;
  }

  /**
   * Update active segments (move them towards player)
   */
  private updateActiveSegments(speed: number): void {
    const activeSegments = this.segmentPool.getActiveSegments();
    const deltaTime = 16; // Assume 60 FPS (16ms per frame)
    
    for (const segment of activeSegments) {
      segment.z -= speed * 0.016;
      
      // Update obstacles and coins relative to segment
      for (const obstacle of segment.obstacles) {
        obstacle.z -= speed * 0.016;
        
        // Update moving obstacles
        if (!obstacle.isStatic && obstacle.speed) {
          const moveSpeed = obstacle.speed * (deltaTime / 1000);
          
          // Simple back and forth movement
          const time = Date.now() / 1000;
          const movement = Math.sin(time * 2) * moveSpeed * 50;
          
          const targetX = this.laneManager.getLaneX(obstacle.lane) + movement;
          obstacle.x = targetX;
        }
      }
      
      for (const coin of segment.coins) {
        coin.z -= speed * 0.016;
      }
    }
  }

  /**
   * Get all obstacles from active segments
   */
  getObstacles(): ObstacleInstance[] {
    const activeSegments = this.segmentPool.getActiveSegments();
    const obstacles: ObstacleInstance[] = [];
    
    for (const segment of activeSegments) {
      obstacles.push(...segment.obstacles);
    }
    
    return obstacles;
  }

  /**
   * Get all coins from active segments
   */
  getCoins(): CoinInstance[] {
    const activeSegments = this.segmentPool.getActiveSegments();
    const coins: CoinInstance[] = [];
    
    for (const segment of activeSegments) {
      coins.push(...segment.coins);
    }
    
    return coins;
  }

  /**
   * Remove collected coin
   */
  collectCoin(coinId: string): void {
    const activeSegments = this.segmentPool.getActiveSegments();
    
    for (const segment of activeSegments) {
      const coinIndex = segment.coins.findIndex(coin => coin.id === coinId);
      if (coinIndex > -1) {
        segment.coins.splice(coinIndex, 1);
        return;
      }
    }
  }

  /**
   * Remove obstacle (when destroyed or passed)
   */
  removeObstacle(obstacleId: string): void {
    const activeSegments = this.segmentPool.getActiveSegments();
    
    for (const segment of activeSegments) {
      const obstacleIndex = segment.obstacles.findIndex(obs => obs.id === obstacleId);
      if (obstacleIndex > -1) {
        segment.obstacles.splice(obstacleIndex, 1);
        return;
      }
    }
  }

  /**
   * Get current difficulty
   */
  getDifficulty(): number {
    return this.difficulty;
  }

  /**
   * Reset track system
   */
  reset(): void {
    // Release all active segments
    const activeSegments = this.segmentPool.getActiveSegments();
    for (const segment of [...activeSegments]) {
      this.segmentPool.release(segment);
    }
    
    this.lastSpawnZ = 0;
    this.difficulty = 1.0;
  }
}

/**
 * Camera System - Third-person perspective
 */
export class CameraSystem {
  private cameraZ: number;
  private targetZ: number;
  private followDistance: number;
  private height: number;

  constructor() {
    this.cameraZ = 0;
    this.targetZ = 0;
    this.followDistance = 300; // Distance behind player
    this.height = 200; // Camera height
  }

  /**
   * Update camera position to follow player
   */
  update(playerZ: number): void {
    this.targetZ = playerZ - this.followDistance;
    
    // Smooth camera follow
    const smoothing = 0.1;
    this.cameraZ += (this.targetZ - this.cameraZ) * smoothing;
  }

  /**
   * Get camera position
   */
  getPosition(): { x: number; y: number; z: number } {
    return {
      x: 0,
      y: this.height,
      z: this.cameraZ,
    };
  }

  /**
   * Transform world coordinates to screen coordinates
   */
  worldToScreen(worldX: number, worldY: number, worldZ: number, canvasWidth: number, canvasHeight: number): { x: number; y: number; scale: number } {
    // Calculate relative position from camera
    const relX = worldX;
    const relY = worldY - this.height;
    const relZ = worldZ - this.cameraZ;

    // Perspective projection
    if (relZ <= 0) {
      // Object is behind camera
      return { x: -1000, y: -1000, scale: 0 };
    }

    const perspective = 1000; // Perspective distance
    const scale = perspective / (perspective + relZ);
    
    const screenX = relX * scale + canvasWidth / 2;
    const screenY = -relY * scale + canvasHeight * 0.7; // 70% down the screen

    return { x: screenX, y: screenY, scale };
  }

  /**
   * Check if object is visible
   */
  isVisible(worldZ: number): boolean {
    return worldZ - this.cameraZ > -100 && worldZ - this.cameraZ < 2000;
  }

  /**
   * Reset camera
   */
  reset(): void {
    this.cameraZ = 0;
    this.targetZ = 0;
  }
}

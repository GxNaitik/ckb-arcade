import { useRef, useCallback } from 'react';
import { LaneManager, TrackSpawner, CameraSystem, TrackSegmentPool } from './LaneSystem';
import type { ObstacleInstance, CoinInstance } from './LaneSystem';

/**
 * Lane system hook for React integration
 *
 * Why this is performant:
 * - All heavy objects stored in refs (no React re-renders)
 * - Object pooling prevents garbage collection spikes
 * - Chunk-based spawning reduces memory usage
 * - Smooth camera following without jitters
 */
export const useLaneSystem = () => {
  // Core lane system components (stored in refs for performance)
  const laneManagerRef = useRef<LaneManager>();
  const trackSpawnerRef = useRef<TrackSpawner>();
  const cameraSystemRef = useRef<CameraSystem>();
  const segmentPoolRef = useRef<TrackSegmentPool>();

  // Initialize systems
  if (!laneManagerRef.current) {
    laneManagerRef.current = new LaneManager(200); // 200px lane width
    trackSpawnerRef.current = new TrackSpawner(laneManagerRef.current);
    cameraSystemRef.current = new CameraSystem();
    segmentPoolRef.current = new TrackSegmentPool(20); // 20 segments in pool
  }

  /**
   * Update lane system (called every frame)
   */
  const update = useCallback((playerZ: number, speed: number, gameTime: number = 0) => {
    const spawner = trackSpawnerRef.current;
    const camera = cameraSystemRef.current;

    if (!spawner || !camera) return;

    // Update track spawning with gameTime for difficulty calculation
    spawner.update(playerZ, speed, gameTime);

    // Update camera position
    camera.update(playerZ);
  }, []);

  /**
   * Get lane configuration
   */
  const getLaneManager = useCallback((): LaneManager => {
    return laneManagerRef.current!;
  }, []);

  /**
   * Get all active obstacles
   */
  const getObstacles = useCallback((): ObstacleInstance[] => {
    return trackSpawnerRef.current?.getObstacles() || [];
  }, []);

  /**
   * Get all active coins
   */
  const getCoins = useCallback((): CoinInstance[] => {
    return trackSpawnerRef.current?.getCoins() || [];
  }, []);

  /**
   * Get CKB coin statistics
   */
  const getCoinStats = useCallback(() => {
    const coins = trackSpawnerRef.current?.getCoins() || [];
    const totalValue = coins.reduce((sum, coin) => sum + coin.value, 0);
    const patterns = coins.reduce((acc, coin) => {
      acc[coin.pattern || 'single'] = (acc[coin.pattern || 'single'] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      totalCoins: coins.length,
      totalValue,
      patterns,
    };
  }, []);

  /**
   * Collect a coin
   */
  const collectCoin = useCallback((coinId: string): boolean => {
    const spawner = trackSpawnerRef.current;
    if (!spawner) return false;

    const coins = spawner.getCoins();
    const coin = coins.find(c => c.id === coinId);

    if (coin) {
      spawner.collectCoin(coinId);
      return true;
    }

    return false;
  }, []);

  /**
   * Remove an obstacle
   */
  const removeObstacle = useCallback((obstacleId: string): void => {
    trackSpawnerRef.current?.removeObstacle(obstacleId);
  }, []);

  /**
   * Transform world coordinates to screen coordinates
   */
  const worldToScreen = useCallback((worldX: number, worldY: number, worldZ: number, canvasWidth: number, canvasHeight: number) => {
    return cameraSystemRef.current?.worldToScreen(worldX, worldY, worldZ, canvasWidth, canvasHeight) || { x: 0, y: 0, scale: 1 };
  }, []);

  /**
   * Check if object is visible
   */
  const isVisible = useCallback((worldZ: number): boolean => {
    return cameraSystemRef.current?.isVisible(worldZ) || false;
  }, []);

  /**
   * Get current difficulty
   */
  const getDifficulty = useCallback((): number => {
    return trackSpawnerRef.current?.getDifficulty() || 1.0;
  }, []);

  /**
   * Reset all systems
   */
  const reset = useCallback(() => {
    trackSpawnerRef.current?.reset();
    cameraSystemRef.current?.reset();
  }, []);

  /**
   * Get lane X position
   */
  const getLaneX = useCallback((laneId: number): number => {
    return laneManagerRef.current?.getLaneX(laneId) || 0;
  }, []);

  /**
   * Get lane from world X position
   */
  const getLaneFromPosition = useCallback((x: number): number => {
    return laneManagerRef.current?.getLaneFromPosition(x) || 1;
  }, []);

  /**
   * Get pool statistics (for debugging)
   */
  const getPoolStats = useCallback(() => {
    const pool = segmentPoolRef.current;
    if (!pool) return { active: 0, pooled: 0 };

    return {
      active: pool.getActiveSegments().length,
      pooled: (pool as any).pool?.length || 0,
    };
  }, []);

  return {
    // Core methods
    update,
    reset,

    // Lane management
    getLaneManager,
    getLaneX,
    getLaneFromPosition,

    // Entity management
    getObstacles,
    getCoins,
    getCoinStats,
    collectCoin,
    removeObstacle,

    // Camera system
    worldToScreen,
    isVisible,

    // Game state
    getDifficulty,

    // Debugging
    getPoolStats,
  };
};

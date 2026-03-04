import { useEffect, useRef, useCallback } from 'react';

/**
 * Core game loop configuration
 */
interface GameLoopConfig {
  onFrame: (deltaTime: number, gameTime: number) => void;
  targetFPS?: number;
  autoStart?: boolean;
}

/**
 * Game loop state stored in refs (not React state)
 * This prevents React re-renders on every frame for 60 FPS performance
 */
interface GameLoopState {
  isRunning: boolean;
  isPaused: boolean;
  lastFrameTime: number;
  gameTime: number;
  frameCount: number;
  actualFPS: number;
  fpsUpdateTime: number;
  fpsFrameCount: number;
}

/**
 * Performance metrics for monitoring
 */
interface PerformanceMetrics {
  currentFPS: number;
  averageFPS: number;
  frameTime: number;
  totalFrames: number;
}

/**
 * Core game loop using requestAnimationFrame
 * 
 * Why refs are used instead of React state:
 * - React state triggers re-renders on every update
 * - Game loop runs at 60 FPS = 60 re-renders per second (killing performance)
 * - refs allow mutable data without triggering React re-renders
 * - Only UI components should use React state
 */
export const useGameLoop = ({ 
  onFrame, 
  targetFPS = 60, 
  autoStart = false 
}: GameLoopConfig) => {
  // Store all game loop state in refs to avoid React re-renders
  const stateRef = useRef<GameLoopState>({
    isRunning: false,
    isPaused: false,
    lastFrameTime: 0,
    gameTime: 0,
    frameCount: 0,
    actualFPS: 0,
    fpsUpdateTime: 0,
    fpsFrameCount: 0,
  });

  // Refs for performance metrics
  const metricsRef = useRef<PerformanceMetrics>({
    currentFPS: 0,
    averageFPS: 0,
    frameTime: 0,
    totalFrames: 0,
  });

  // Ref for animation frame ID
  const animationFrameRef = useRef<number>();

  // Ref for target frame time (for FPS limiting)
  const targetFrameTimeRef = useRef<number>(1000 / targetFPS);

  // Ref to store the latest onFrame callback (avoids stale closure)
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  /**
   * Main game loop function
   * Runs at 60 FPS using requestAnimationFrame
   */
  const gameLoop = useCallback((currentTime: number) => {
    const state = stateRef.current;
    
    // Skip if game is not running or is paused
    if (!state.isRunning || state.isPaused) {
      return;
    }

    // Calculate delta time (time since last frame)
    const deltaTime = state.lastFrameTime === 0 
      ? 0 // First frame, no delta time
      : currentTime - state.lastFrameTime;
    
    state.lastFrameTime = currentTime;

    // Update total game time
    state.gameTime += deltaTime;
    state.frameCount++;

    // Calculate FPS metrics (updated every 500ms)
    state.fpsFrameCount++;
    if (currentTime - state.fpsUpdateTime >= 500) {
      state.actualFPS = (state.fpsFrameCount * 1000) / (currentTime - state.fpsUpdateTime);
      state.fpsUpdateTime = currentTime;
      state.fpsFrameCount = 0;
      
      // Update performance metrics
      metricsRef.current.currentFPS = state.actualFPS;
      metricsRef.current.frameTime = deltaTime;
      metricsRef.current.totalFrames = state.frameCount;
    }

    // Execute game logic with delta time
    // This is where all game systems will be updated
    onFrameRef.current(deltaTime, state.gameTime);

    // Continue the loop
    animationFrameRef.current = requestAnimationFrame(gameLoop);
  }, []);

  /**
   * Start the game loop
   */
  const start = useCallback(() => {
    const state = stateRef.current;
    
    if (state.isRunning) {
      return; // Already running
    }

    // Reset state for new game
    state.isRunning = true;
    state.isPaused = false;
    state.lastFrameTime = 0;
    state.gameTime = 0;
    state.frameCount = 0;
    state.fpsUpdateTime = performance.now();
    state.fpsFrameCount = 0;

    // Start the game loop
    animationFrameRef.current = requestAnimationFrame(gameLoop);
  }, [gameLoop]);

  /**
   * Pause the game loop (freeze game state)
   */
  const pause = useCallback(() => {
    stateRef.current.isPaused = true;
  }, []);

  /**
   * Resume the game loop
   */
  const resume = useCallback(() => {
    const state = stateRef.current;
    
    if (!state.isRunning) {
      return; // Can't resume if not running
    }

    // Reset last frame time to avoid large delta time after pause
    state.lastFrameTime = performance.now();
    state.isPaused = false;

    // Resume the loop
    animationFrameRef.current = requestAnimationFrame(gameLoop);
  }, []);

  /**
   * Stop the game loop completely
   */
  const stop = useCallback(() => {
    const state = stateRef.current;
    
    state.isRunning = false;
    state.isPaused = false;

    // Cancel the animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }
  }, []);

  /**
   * Get current performance metrics
   * This is safe to call from React components as it doesn't trigger re-renders
   */
  const getMetrics = useCallback((): PerformanceMetrics => {
    return { ...metricsRef.current };
  }, []);

  /**
   * Get current game state
   * Returns a copy to prevent direct mutation
   */
  const getGameState = useCallback(() => {
    const state = stateRef.current;
    return {
      isRunning: state.isRunning,
      isPaused: state.isPaused,
      gameTime: state.gameTime,
      frameCount: state.frameCount,
    };
  }, []);

  /**
   * Set target FPS (for performance optimization)
   */
  const setTargetFPS = useCallback((fps: number) => {
    targetFrameTimeRef.current = 1000 / fps;
  }, []);

  // Auto-start if requested
  useEffect(() => {
    if (autoStart) {
      start();
    }

    // Cleanup on unmount
    return () => {
      stop();
    };
  }, [autoStart, start, stop]);

  return {
    // Control methods
    start,
    pause,
    resume,
    stop,
    
    // State getters
    getMetrics,
    getGameState,
    
    // Configuration
    setTargetFPS,
    
    // Read-only state (for UI components)
    isRunning: () => stateRef.current.isRunning,
    isPaused: () => stateRef.current.isPaused,
    gameTime: () => stateRef.current.gameTime,
  };
};

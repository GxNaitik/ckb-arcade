/**
 * Game Session Tracker
 * Collects detailed gameplay data for anti-cheat validation
 */

import { GameSessionData } from './AntiCheatValidator';

export interface MovementEvent {
  timestamp: number;
  type: 'lane_change' | 'jump' | 'slide' | 'collision';
  fromLane?: number;
  toLane?: number;
  position: { x: number; y: number; z: number };
  speed: number;
}

export interface PerformanceSnapshot {
  timestamp: number;
  score: number;
  coinsCollected: number;
  distance: number;
  speed: number;
  obstaclesPassed: number;
  obstaclesHit: number;
}

/**
 * Game Session Tracker
 * Tracks all gameplay events for validation
 */
export class GameSessionTracker {
  private sessionId: string;
  private startTime: number;
  private endTime: number = 0;
  private gameSeed: string;
  
  // Movement tracking
  private movementEvents: MovementEvent[] = [];
  private laneChanges: number = 0;
  private jumps: number = 0;
  private slides: number = 0;
  private obstaclesHit: number = 0;
  
  // Performance tracking
  private performanceSnapshots: PerformanceSnapshot[] = [];
  private maxSpeed: number = 0;
  private totalSpeed: number = 0;
  private speedMeasurements: number = 0;
  
  // Coin tracking
  private coinCollectionTimes: number[] = [];
  private coinPositions: { x: number; y: number; z: number; timestamp: number }[] = [];
  
  // State tracking
  private lastSnapshot: PerformanceSnapshot | null = null;
  private isTracking: boolean = false;

  constructor(sessionId: string, gameSeed: string) {
    this.sessionId = sessionId;
    this.gameSeed = gameSeed;
    this.startTime = Date.now();
    this.isTracking = true;
    
    // Take initial snapshot
    this.takeSnapshot();
  }

  /**
   * Record a movement event
   */
  recordMovementEvent(event: Omit<MovementEvent, 'timestamp'>): void {
    if (!this.isTracking) return;
    
    const fullEvent: MovementEvent = {
      ...event,
      timestamp: Date.now(),
    };
    
    this.movementEvents.push(fullEvent);
    
    // Update counters
    switch (event.type) {
      case 'lane_change':
        this.laneChanges++;
        break;
      case 'jump':
        this.jumps++;
        break;
      case 'slide':
        this.slides++;
        break;
      case 'collision':
        this.obstaclesHit++;
        break;
    }
    
    // Update speed tracking
    this.maxSpeed = Math.max(this.maxSpeed, event.speed);
    this.totalSpeed += event.speed;
    this.speedMeasurements++;
  }

  /**
   * Record coin collection
   */
  recordCoinCollection(position: { x: number; y: number; z: number }): void {
    if (!this.isTracking) return;
    
    const timestamp = Date.now();
    this.coinCollectionTimes.push(timestamp);
    this.coinPositions.push({ ...position, timestamp });
  }

  /**
   * Take a performance snapshot
   */
  takeSnapshot(): void {
    if (!this.isTracking) return;
    
    const timestamp = Date.now();
    const snapshot: PerformanceSnapshot = {
      timestamp,
      score: 0, // Will be updated by external state
      coinsCollected: this.coinCollectionTimes.length,
      distance: 0, // Will be updated by external state
      speed: 0, // Will be updated by external state
      obstaclesPassed: 0,
      obstaclesHit: this.obstaclesHit,
    };
    
    this.performanceSnapshots.push(snapshot);
    this.lastSnapshot = snapshot;
  }

  /**
   * Update current performance snapshot
   */
  updateCurrentSnapshot(data: {
    score: number;
    distance: number;
    speed: number;
    obstaclesPassed: number;
  }): void {
    if (!this.isTracking || !this.lastSnapshot) return;
    
    this.lastSnapshot.score = data.score;
    this.lastSnapshot.distance = data.distance;
    this.lastSnapshot.speed = data.speed;
    this.lastSnapshot.obstaclesPassed = data.obstaclesPassed;
    
    // Update speed tracking
    this.maxSpeed = Math.max(this.maxSpeed, data.speed);
    this.totalSpeed += data.speed;
    this.speedMeasurements++;
  }

  /**
   * End tracking and generate session data
   */
  endTracking(): GameSessionData {
    this.isTracking = false;
    this.endTime = Date.now();
    
    const duration = this.endTime - this.startTime;
    const averageSpeed = this.speedMeasurements > 0 ? this.totalSpeed / this.speedMeasurements : 0;
    
    // Get final snapshot
    const finalSnapshot = this.performanceSnapshots[this.performanceSnapshots.length - 1] || {
      score: 0,
      coinsCollected: this.coinCollectionTimes.length,
      distance: 0,
      speed: 0,
      obstaclesPassed: 0,
      obstaclesHit: this.obstaclesHit,
    };
    
    return {
      sessionId: this.sessionId,
      startTime: this.startTime,
      endTime: this.endTime,
      duration,
      finalScore: finalSnapshot.score,
      coinsCollected: finalSnapshot.coinsCollected,
      distance: finalSnapshot.distance,
      maxSpeed: this.maxSpeed,
      averageSpeed,
      obstaclesHit: this.obstaclesHit,
      powerUpsCollected: 0, // Not implemented yet
      laneChanges: this.laneChanges,
      jumps: this.jumps,
      slides: this.slides,
      gameSeed: this.gameSeed,
      clientVersion: '1.0.0', // Could be dynamic
    };
  }

  /**
   * Get real-time statistics
   */
  getRealTimeStats(): {
    duration: number;
    coinsPerMinute: number;
    averageSpeed: number;
    currentScore: number;
    violations: string[];
  } {
    const now = Date.now();
    const currentDuration = now - this.startTime;
    const minutesPlayed = currentDuration / 60000;
    const coinsPerMinute = minutesPlayed > 0 ? this.coinCollectionTimes.length / minutesPlayed : 0;
    const averageSpeed = this.speedMeasurements > 0 ? this.totalSpeed / this.speedMeasurements : 0;
    const currentScore = this.lastSnapshot?.score || 0;
    
    // Basic real-time violation detection
    const violations: string[] = [];
    
    // Check for excessive coin collection rate
    if (coinsPerMinute > 200) {
      violations.push('Excessive coin collection rate');
    }
    
    // Check for impossible speed
    if (averageSpeed > 20) {
      violations.push('Impossible average speed');
    }
    
    return {
      duration: currentDuration,
      coinsPerMinute,
      averageSpeed,
      currentScore,
      violations,
    };
  }

  /**
   * Export raw data for debugging
   */
  exportRawData(): {
    movementEvents: MovementEvent[];
    performanceSnapshots: PerformanceSnapshot[];
    coinCollectionTimes: number[];
    coinPositions: { x: number; y: number; z: number; timestamp: number }[];
  } {
    return {
      movementEvents: [...this.movementEvents],
      performanceSnapshots: [...this.performanceSnapshots],
      coinCollectionTimes: [...this.coinCollectionTimes],
      coinPositions: [...this.coinPositions],
    };
  }

  /**
   * Check if tracking is active
   */
  isActive(): boolean {
    return this.isTracking;
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get game seed
   */
  getGameSeed(): string {
    return this.gameSeed;
  }
}

/**
 * React hook for session tracking
 */
export const useGameSessionTracker = (sessionId: string, gameSeed: string) => {
  // In a real implementation, this would use React hooks
  // For now, return a simple factory function
  return new GameSessionTracker(sessionId, gameSeed);
};

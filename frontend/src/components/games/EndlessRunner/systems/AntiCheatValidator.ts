/**
 * Anti-Cheat Validation System for CKB Arcade
 * Validates game sessions for cheating attempts
 */

export interface GameSessionData {
  sessionId: string;
  startTime: number;
  endTime: number;
  duration: number;
  finalScore: number;
  coinsCollected: number;
  distance: number;
  maxSpeed: number;
  averageSpeed: number;
  obstaclesHit: number;
  powerUpsCollected: number;
  laneChanges: number;
  jumps: number;
  slides: number;
  gameSeed: string;
  clientVersion: string;
}

export interface ValidationResult {
  isValid: boolean;
  violations: CheatViolation[];
  riskScore: number; // 0-100, higher = more suspicious
  adjustedRewards?: {
    entryFee: number;
    coinsValue: number;
    reward: number;
  };
}

export interface CheatViolation {
  type: ViolationType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  detectedValue: number;
  expectedValue: number;
  penalty: number; // Percentage reduction in rewards
}

export enum ViolationType {
  IMPOSSIBLE_COIN_COUNT = 'impossible_coin_count',
  EXCESSIVE_COIN_DENSITY = 'excessive_coin_density',
  IMPOSSIBLE_SPEED = 'impossible_speed',
  IMPOSSIBLE_DURATION = 'impossible_duration',
  MANIPULATED_TIME = 'manipulated_time',
  INCONSISTENT_SEED = 'inconsistent_seed',
  UNREALISTIC_MOVEMENT = 'unrealistic_movement',
  PERFECT_TIMING = 'perfect_timing',
  ZERO_ERRORS = 'zero_errors',
  STATISTICAL_ANOMALY = 'statistical_anomaly',
}

/**
 * Anti-Cheat Validator
 * Enforces game rules and detects cheating attempts
 */
export class AntiCheatValidator {
  private readonly CONFIG = {
    // Coin density limits (coins per second)
    MAX_COIN_DENSITY_EASY: 2.0, // Easy difficulty
    MAX_COIN_DENSITY_MEDIUM: 3.0, // Medium difficulty
    MAX_COIN_DENSITY_HARD: 4.0, // Hard difficulty
    MAX_COIN_DENSITY_EXTREME: 5.0, // Extreme difficulty
    
    // Speed limits (units per second)
    MAX_PLAYER_SPEED: 20,
    MIN_PLAYER_SPEED: 5,
    MAX_AVERAGE_SPEED: 15,
    
    // Duration limits (seconds)
    MIN_GAME_DURATION: 10,
    MAX_GAME_DURATION: 300, // 5 minutes max
    
    // Movement limits
    MAX_LANE_CHANGES_PER_SECOND: 2,
    MAX_JUMPS_PER_SECOND: 1,
    MAX_SLIDES_PER_SECOND: 1,
    
    // Statistical thresholds
    MAX_PERFORMANCE_RATIO: 1.5, // 50% better than perfect play
    MIN_ERROR_RATE: 0.01, // At least 1% error rate expected
    
    // Penalties
    VIOLATION_PENALTIES: {
      low: 10,    // 10% reward reduction
      medium: 25, // 25% reward reduction
      high: 50,   // 50% reward reduction
      critical: 100, // Complete reward denial
    },
  };

  /**
   * Validate a complete game session
   */
  validateSession(sessionData: GameSessionData): ValidationResult {
    const violations: CheatViolation[] = [];
    
    // 1. Coin Density Validation
    this.validateCoinDensity(sessionData, violations);
    
    // 2. Speed Validation
    this.validateSpeed(sessionData, violations);
    
    // 3. Duration Validation
    this.validateDuration(sessionData, violations);
    
    // 4. Movement Pattern Validation
    this.validateMovement(sessionData, violations);
    
    // 5. Statistical Anomaly Detection
    this.validateStatistics(sessionData, violations);
    
    // 6. Performance Validation
    this.validatePerformance(sessionData, violations);
    
    // Calculate risk score
    const riskScore = this.calculateRiskScore(violations);
    
    // Apply penalties
    const adjustedRewards = this.calculateAdjustedRewards(sessionData, violations);
    
    return {
      isValid: violations.length === 0,
      violations,
      riskScore,
      adjustedRewards,
    };
  }

  /**
   * Validate coin collection density
   */
  private validateCoinDensity(session: GameSessionData, violations: CheatViolation[]): void {
    const durationInSeconds = session.duration / 1000;
    const coinDensity = session.coinsCollected / durationInSeconds;
    
    // Determine expected max density based on game duration (difficulty increases over time)
    let maxExpectedDensity = this.CONFIG.MAX_COIN_DENSITY_EASY;
    
    if (durationInSeconds > 60) maxExpectedDensity = this.CONFIG.MAX_COIN_DENSITY_MEDIUM;
    if (durationInSeconds > 120) maxExpectedDensity = this.CONFIG.MAX_COIN_DENSITY_HARD;
    if (durationInSeconds > 180) maxExpectedDensity = this.CONFIG.MAX_COIN_DENSITY_EXTREME;
    
    // Check for impossible coin collection
    if (coinDensity > maxExpectedDensity * 2) {
      violations.push({
        type: ViolationType.IMPOSSIBLE_COIN_COUNT,
        severity: 'critical',
        description: `Impossible coin collection rate: ${coinDensity.toFixed(2)} coins/sec`,
        detectedValue: coinDensity,
        expectedValue: maxExpectedDensity,
        penalty: this.CONFIG.VIOLATION_PENALTIES.critical,
      });
    } else if (coinDensity > maxExpectedDensity * 1.5) {
      violations.push({
        type: ViolationType.EXCESSIVE_COIN_DENSITY,
        severity: 'high',
        description: `Excessive coin collection rate: ${coinDensity.toFixed(2)} coins/sec`,
        detectedValue: coinDensity,
        expectedValue: maxExpectedDensity,
        penalty: this.CONFIG.VIOLATION_PENALTIES.high,
      });
    } else if (coinDensity > maxExpectedDensity) {
      violations.push({
        type: ViolationType.EXCESSIVE_COIN_DENSITY,
        severity: 'medium',
        description: `High coin collection rate: ${coinDensity.toFixed(2)} coins/sec`,
        detectedValue: coinDensity,
        expectedValue: maxExpectedDensity,
        penalty: this.CONFIG.VIOLATION_PENALTIES.medium,
      });
    }
  }

  /**
   * Validate speed metrics
   */
  private validateSpeed(session: GameSessionData, violations: CheatViolation[]): void {
    // Check max speed
    if (session.maxSpeed > this.CONFIG.MAX_PLAYER_SPEED) {
      violations.push({
        type: ViolationType.IMPOSSIBLE_SPEED,
        severity: 'critical',
        description: `Impossible maximum speed: ${session.maxSpeed} units/sec`,
        detectedValue: session.maxSpeed,
        expectedValue: this.CONFIG.MAX_PLAYER_SPEED,
        penalty: this.CONFIG.VIOLATION_PENALTIES.critical,
      });
    }
    
    // Check average speed
    if (session.averageSpeed > this.CONFIG.MAX_AVERAGE_SPEED) {
      violations.push({
        type: ViolationType.IMPOSSIBLE_SPEED,
        severity: 'high',
        description: `Impossible average speed: ${session.averageSpeed} units/sec`,
        detectedValue: session.averageSpeed,
        expectedValue: this.CONFIG.MAX_AVERAGE_SPEED,
        penalty: this.CONFIG.VIOLATION_PENALTIES.high,
      });
    }
    
    // Check speed consistency
    const speedRatio = session.maxSpeed / session.averageSpeed;
    if (speedRatio > 3) {
      violations.push({
        type: ViolationType.UNREALISTIC_MOVEMENT,
        severity: 'medium',
        description: `Inconsistent speed pattern: ratio ${speedRatio.toFixed(2)}`,
        detectedValue: speedRatio,
        expectedValue: 2,
        penalty: this.CONFIG.VIOLATION_PENALTIES.medium,
      });
    }
  }

  /**
   * Validate game duration
   */
  private validateDuration(session: GameSessionData, violations: CheatViolation[]): void {
    const durationInSeconds = session.duration / 1000;
    
    if (durationInSeconds < this.CONFIG.MIN_GAME_DURATION) {
      violations.push({
        type: ViolationType.IMPOSSIBLE_DURATION,
        severity: 'medium',
        description: `Suspiciously short game duration: ${durationInSeconds}s`,
        detectedValue: durationInSeconds,
        expectedValue: this.CONFIG.MIN_GAME_DURATION,
        penalty: this.CONFIG.VIOLATION_PENALTIES.medium,
      });
    }
    
    if (durationInSeconds > this.CONFIG.MAX_GAME_DURATION) {
      violations.push({
        type: ViolationType.MANIPULATED_TIME,
        severity: 'high',
        description: `Impossible game duration: ${durationInSeconds}s`,
        detectedValue: durationInSeconds,
        expectedValue: this.CONFIG.MAX_GAME_DURATION,
        penalty: this.CONFIG.VIOLATION_PENALTIES.high,
      });
    }
  }

  /**
   * Validate movement patterns
   */
  private validateMovement(session: GameSessionData, violations: CheatViolation[]): void {
    const durationInSeconds = session.duration / 1000;
    
    // Check lane changes
    const laneChangesPerSec = session.laneChanges / durationInSeconds;
    if (laneChangesPerSec > this.CONFIG.MAX_LANE_CHANGES_PER_SECOND) {
      violations.push({
        type: ViolationType.UNREALISTIC_MOVEMENT,
        severity: 'medium',
        description: `Excessive lane changes: ${laneChangesPerSec.toFixed(2)}/sec`,
        detectedValue: laneChangesPerSec,
        expectedValue: this.CONFIG.MAX_LANE_CHANGES_PER_SECOND,
        penalty: this.CONFIG.VIOLATION_PENALTIES.medium,
      });
    }
    
    // Check jumps
    const jumpsPerSec = session.jumps / durationInSeconds;
    if (jumpsPerSec > this.CONFIG.MAX_JUMPS_PER_SECOND) {
      violations.push({
        type: ViolationType.UNREALISTIC_MOVEMENT,
        severity: 'medium',
        description: `Excessive jumps: ${jumpsPerSec.toFixed(2)}/sec`,
        detectedValue: jumpsPerSec,
        expectedValue: this.CONFIG.MAX_JUMPS_PER_SECOND,
        penalty: this.CONFIG.VIOLATION_PENALTIES.medium,
      });
    }
    
    // Check slides
    const slidesPerSec = session.slides / durationInSeconds;
    if (slidesPerSec > this.CONFIG.MAX_SLIDES_PER_SECOND) {
      violations.push({
        type: ViolationType.UNREALISTIC_MOVEMENT,
        severity: 'medium',
        description: `Excessive slides: ${slidesPerSec.toFixed(2)}/sec`,
        detectedValue: slidesPerSec,
        expectedValue: this.CONFIG.MAX_SLIDES_PER_SECOND,
        penalty: this.CONFIG.VIOLATION_PENALTIES.medium,
      });
    }
    
    // Check for perfect play (no obstacles hit)
    if (session.duration > 60000 && session.obstaclesHit === 0) { // 1+ minute games
      violations.push({
        type: ViolationType.ZERO_ERRORS,
        severity: 'low',
        description: 'Perfect play with no obstacles hit',
        detectedValue: 0,
        expectedValue: 1,
        penalty: this.CONFIG.VIOLATION_PENALTIES.low,
      });
    }
  }

  /**
   * Validate statistical anomalies
   */
  private validateStatistics(session: GameSessionData, violations: CheatViolation[]): void {
    // Check for suspiciously perfect timing
    if (session.duration % 1000 === 0 && session.coinsCollected > 50) {
      violations.push({
        type: ViolationType.PERFECT_TIMING,
        severity: 'low',
        description: 'Suspiciously perfect timing',
        detectedValue: session.duration,
        expectedValue: session.duration + 1,
        penalty: this.CONFIG.VIOLATION_PENALTIES.low,
      });
    }
    
    // Check coin collection patterns
    const coinsPerDistance = session.coinsCollected / Math.max(session.distance, 1);
    if (coinsPerDistance > 0.1) { // More than 1 coin per 10 units
      violations.push({
        type: ViolationType.STATISTICAL_ANOMALY,
        severity: 'medium',
        description: `Unusual coin density: ${coinsPerDistance.toFixed(3)} coins/unit`,
        detectedValue: coinsPerDistance,
        expectedValue: 0.1,
        penalty: this.CONFIG.VIOLATION_PENALTIES.medium,
      });
    }
  }

  /**
   * Validate overall performance
   */
  private validatePerformance(session: GameSessionData, violations: CheatViolation[]): void {
    // Calculate performance score
    const perfectScore = session.coinsCollected * 10 + (session.duration >= 180000 ? 400 : 0);
    const performanceRatio = session.finalScore / Math.max(perfectScore, 1);
    
    if (performanceRatio > this.CONFIG.MAX_PERFORMANCE_RATIO) {
      violations.push({
        type: ViolationType.STATISTICAL_ANOMALY,
        severity: 'high',
        description: `Impossible performance ratio: ${performanceRatio.toFixed(2)}`,
        detectedValue: performanceRatio,
        expectedValue: this.CONFIG.MAX_PERFORMANCE_RATIO,
        penalty: this.CONFIG.VIOLATION_PENALTIES.high,
      });
    }
  }

  /**
   * Calculate overall risk score
   */
  private calculateRiskScore(violations: CheatViolation[]): number {
    if (violations.length === 0) return 0;
    
    let totalScore = 0;
    for (const violation of violations) {
      switch (violation.severity) {
        case 'low': totalScore += 10; break;
        case 'medium': totalScore += 25; break;
        case 'high': totalScore += 50; break;
        case 'critical': totalScore += 100; break;
      }
    }
    
    return Math.min(totalScore, 100);
  }

  /**
   * Calculate adjusted rewards based on violations
   */
  private calculateAdjustedRewards(session: GameSessionData, violations: CheatViolation[]): {
    entryFee: number;
    coinsValue: number;
    reward: number;
  } {
    const entryFee = 199;
    let coinsValue = session.coinsCollected * 10;
    let reward = session.duration >= 180000 ? 400 : 0;
    
    // Apply penalties
    let maxPenalty = 0;
    for (const violation of violations) {
      maxPenalty = Math.max(maxPenalty, violation.penalty);
    }
    
    if (maxPenalty > 0) {
      const penaltyMultiplier = (100 - maxPenalty) / 100;
      coinsValue = Math.floor(coinsValue * penaltyMultiplier);
      reward = Math.floor(reward * penaltyMultiplier);
    }
    
    return {
      entryFee,
      coinsValue,
      reward,
    };
  }

  /**
   * Server-side recomputation (pseudocode for documentation)
   */
  serverSideRecomputation(sessionData: GameSessionData): ValidationResult {
    // Server would:
    // 1. Verify session seed matches client
    // 2. Recompute expected coin positions using same seed
    // 3. Validate movement patterns against physics
    // 4. Check timing consistency with server timestamps
    // 5. Cross-reference with player history
    
    return this.validateSession(sessionData);
  }
}

// Global validator instance
export const antiCheatValidator = new AntiCheatValidator();

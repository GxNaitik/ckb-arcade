/**
 * FPS Monitor for Performance Tracking
 * Monitors frame rate and performance metrics
 */

export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  memoryUsage?: number;
  renderTime: number;
  updateTime: number;
  droppedFrames: number;
  totalFrames: number;
}

export interface FPSMonitorOptions {
  targetFPS: number;
  smoothingFactor: number;
  historySize: number;
  enableMemoryTracking: boolean;
}

export class FPSMonitor {
  private options: FPSMonitorOptions;
  private frameCount: number = 0;
  private lastTime: number = 0;
  private fps: number = 0;
  private frameTime: number = 0;
  private renderTime: number = 0;
  private updateTime: number = 0;
  private droppedFrames: number = 0;
  private totalFrames: number = 0;
  
  // Performance history
  private fpsHistory: number[] = [];
  private frameTimeHistory: number[] = [];
  private memoryHistory: number[] = [];
  
  // Timing
  private updateStartTime: number = 0;
  private renderStartTime: number = 0;
  
  // Callbacks
  private onFPSUpdate?: (metrics: PerformanceMetrics) => void;
  private onPerformanceWarning?: (metrics: PerformanceMetrics) => void;
  
  // Monitoring state
  private isMonitoring: boolean = false;
  private monitoringInterval: number | null = null;
  private lastUpdateTime: number = 0;
  private updateInterval: number = 1000; // Update metrics every second

  constructor(options: Partial<FPSMonitorOptions> = {}) {
    this.options = {
      targetFPS: 60,
      smoothingFactor: 0.9,
      historySize: 60,
      enableMemoryTracking: true,
      ...options,
    };
  }

  /**
   * Start monitoring performance
   */
  start(): void {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.lastTime = performance.now();
    this.frameCount = 0;
    this.totalFrames = 0;
    this.droppedFrames = 0;
    this.lastUpdateTime = performance.now();
    
    // Start periodic monitoring
    const update = (now: number) => {
      if (now - this.lastUpdateTime >= this.updateInterval) {
        this.updateMetrics();
        this.lastUpdateTime = now;
      }
      
      if (this.isMonitoring) {
        this.monitoringInterval = requestAnimationFrame(update) as unknown as number;
      }
    };
    this.monitoringInterval = requestAnimationFrame(update) as unknown as number;
  }

  /**
   * Stop monitoring performance
   */
  stop(): void {
    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Called at the beginning of each frame
   */
  beginFrame(): void {
    // Frame start time tracking - implementation can be added when needed
  }

  /**
   * Called at the beginning of update phase
   */
  beginUpdate(): void {
    this.updateStartTime = performance.now();
  }

  /**
   * Called at the end of update phase
   */
  endUpdate(): void {
    this.updateTime = performance.now() - this.updateStartTime;
  }

  /**
   * Called at the beginning of render phase
   */
  beginRender(): void {
    this.renderStartTime = performance.now();
  }

  /**
   * Called at the end of render phase
   */
  endRender(): void {
    this.renderTime = performance.now() - this.renderStartTime;
  }

  /**
   * Called at the end of each frame
   */
  endFrame(): void {
    if (!this.isMonitoring) return;
    
    const now = performance.now();
    const deltaTime = now - this.lastTime;
    
    this.frameCount++;
    this.totalFrames++;
    
    // Calculate FPS with smoothing
    const currentFPS = 1000 / deltaTime;
    this.fps = this.fps * this.options.smoothingFactor + currentFPS * (1 - this.options.smoothingFactor);
    
    this.frameTime = deltaTime;
    
    // Check for dropped frames
    if (deltaTime > (1000 / this.options.targetFPS) * 1.5) {
      this.droppedFrames++;
    }
    
    this.lastTime = now;
    
    // Update history
    this.updateHistory();
  }

  /**
   * Update performance metrics history
   */
  private updateHistory(): void {
    // Update FPS history
    this.fpsHistory.push(this.fps);
    if (this.fpsHistory.length > this.options.historySize) {
      this.fpsHistory.shift();
    }
    
    // Update frame time history
    this.frameTimeHistory.push(this.frameTime);
    if (this.frameTimeHistory.length > this.options.historySize) {
      this.frameTimeHistory.shift();
    }
    
    // Update memory history if enabled
    if (this.options.enableMemoryTracking && 'memory' in performance) {
      const memory = (performance as any).memory;
      const memoryUsage = memory.usedJSHeapSize / 1024 / 1024; // MB
      this.memoryHistory.push(memoryUsage);
      if (this.memoryHistory.length > this.options.historySize) {
        this.memoryHistory.shift();
      }
    }
  }

  /**
   * Update and report metrics
   */
  private updateMetrics(): void {
    const metrics = this.getCurrentMetrics();
    
    // Trigger FPS update callback
    this.onFPSUpdate?.(metrics);
    
    // Check for performance warnings
    if (metrics.fps < this.options.targetFPS * 0.8) {
      this.onPerformanceWarning?.(metrics);
    }
  }

  /**
   * Get current performance metrics
   */
  getCurrentMetrics(): PerformanceMetrics {
    const memoryUsage = this.options.enableMemoryTracking && 'memory' in performance 
      ? (performance as any).memory.usedJSHeapSize / 1024 / 1024 
      : undefined;

    return {
      fps: Math.round(this.fps),
      frameTime: Math.round(this.frameTime * 100) / 100,
      memoryUsage,
      renderTime: Math.round(this.renderTime * 100) / 100,
      updateTime: Math.round(this.updateTime * 100) / 100,
      droppedFrames: this.droppedFrames,
      totalFrames: this.totalFrames,
    };
  }

  /**
   * Get average FPS over history
   */
  getAverageFPS(): number {
    if (this.fpsHistory.length === 0) return 0;
    const sum = this.fpsHistory.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.fpsHistory.length);
  }

  /**
   * Get average frame time over history
   */
  getAverageFrameTime(): number {
    if (this.frameTimeHistory.length === 0) return 0;
    const sum = this.frameTimeHistory.reduce((a, b) => a + b, 0);
    return Math.round((sum / this.frameTimeHistory.length) * 100) / 100;
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): {
    current: number;
    average: number;
    peak: number;
  } | null {
    if (!this.options.enableMemoryTracking || this.memoryHistory.length === 0) {
      return null;
    }
    
    const current = this.memoryHistory[this.memoryHistory.length - 1];
    const average = this.memoryHistory.reduce((a, b) => a + b, 0) / this.memoryHistory.length;
    const peak = Math.max(...this.memoryHistory);
    
    return {
      current: Math.round(current * 100) / 100,
      average: Math.round(average * 100) / 100,
      peak: Math.round(peak * 100) / 100,
    };
  }

  /**
   * Get performance score (0-100)
   */
  getPerformanceScore(): number {
    const metrics = this.getCurrentMetrics();
    const targetFrameTime = 1000 / this.options.targetFPS;
    
    // FPS score (40% weight)
    const fpsScore = Math.min(100, (metrics.fps / this.options.targetFPS) * 100);
    
    // Frame time score (30% weight)
    const frameTimeScore = Math.max(0, Math.min(100, 100 - ((metrics.frameTime - targetFrameTime) / targetFrameTime) * 100));
    
    // Dropped frames score (20% weight)
    const dropRate = this.totalFrames > 0 ? (metrics.droppedFrames / this.totalFrames) * 100 : 0;
    const dropScore = Math.max(0, 100 - dropRate * 2);
    
    // Memory score (10% weight)
    let memoryScore = 100;
    if (metrics.memoryUsage && metrics.memoryUsage > 100) { // 100MB threshold
      memoryScore = Math.max(0, 100 - (metrics.memoryUsage - 100) * 0.5);
    }
    
    const totalScore = fpsScore * 0.4 + frameTimeScore * 0.3 + dropScore * 0.2 + memoryScore * 0.1;
    return Math.round(totalScore);
  }

  /**
   * Set FPS update callback
   */
  setFPSUpdateCallback(callback: (metrics: PerformanceMetrics) => void): void {
    this.onFPSUpdate = callback;
  }

  /**
   * Set performance warning callback
   */
  setPerformanceWarningCallback(callback: (metrics: PerformanceMetrics) => void): void {
    this.onPerformanceWarning = callback;
  }

  /**
   * Get performance report
   */
  getReport(): {
    summary: PerformanceMetrics;
    averages: {
      fps: number;
      frameTime: number;
    };
    memory: {
      current: number;
      average: number;
      peak: number;
    } | null;
    score: number;
    recommendations: string[];
  } {
    const summary = this.getCurrentMetrics();
    const averages = {
      fps: this.getAverageFPS(),
      frameTime: this.getAverageFrameTime(),
    };
    const memory = this.getMemoryStats();
    const score = this.getPerformanceScore();
    
    const recommendations = this.generateRecommendations(summary, averages, memory);
    
    return {
      summary,
      averages,
      memory,
      score,
      recommendations,
    };
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(
    summary: PerformanceMetrics,
    averages: { fps: number; frameTime: number },
    memory: ReturnType<typeof this.getMemoryStats>
  ): string[] {
    const recommendations: string[] = [];
    
    if (averages.fps < this.options.targetFPS * 0.9) {
      recommendations.push('Consider reducing visual effects or particle count');
    }
    
    if (averages.frameTime > 1000 / this.options.targetFPS * 1.2) {
      recommendations.push('Optimize game logic and rendering code');
    }
    
    if (summary.droppedFrames > summary.totalFrames * 0.05) {
      recommendations.push('Too many dropped frames - consider lowering target quality');
    }
    
    if (memory && memory.current > 150) {
      recommendations.push('High memory usage - implement object pooling');
    }
    
    if (summary.renderTime > summary.updateTime * 2) {
      recommendations.push('Rendering is bottleneck - optimize draw calls');
    }
    
    if (summary.updateTime > 16) {
      recommendations.push('Game logic is slow - optimize update loops');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('Performance is optimal!');
    }
    
    return recommendations;
  }

  /**
   * Reset monitoring statistics
   */
  reset(): void {
    this.frameCount = 0;
    this.totalFrames = 0;
    this.droppedFrames = 0;
    this.fps = 0;
    this.frameTime = 0;
    this.renderTime = 0;
    this.updateTime = 0;
    
    this.fpsHistory.length = 0;
    this.frameTimeHistory.length = 0;
    this.memoryHistory.length = 0;
  }

  /**
   * Export performance data for analysis
   */
  exportData(): {
    timestamp: number;
    metrics: PerformanceMetrics;
    history: {
      fps: number[];
      frameTime: number[];
      memory: number[];
    };
  } {
    return {
      timestamp: Date.now(),
      metrics: this.getCurrentMetrics(),
      history: {
        fps: [...this.fpsHistory],
        frameTime: [...this.frameTimeHistory],
        memory: [...this.memoryHistory],
      },
    };
  }
}

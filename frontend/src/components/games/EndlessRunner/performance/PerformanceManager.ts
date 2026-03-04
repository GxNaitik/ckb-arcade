/**
 * Performance Manager
 * Coordinates all performance optimizations and monitoring
 */

import { ObjectPool, ParticleSystem } from './ObjectPool';
import { TouchOptimizer, HapticFeedback } from './TouchOptimizer';
import { FPSMonitor, PerformanceMetrics } from './FPSMonitor';

export interface PerformanceSettings {
  targetFPS: number;
  enableParticles: boolean;
  particleCount: number;
  enableTouchOptimization: boolean;
  enableFPSMonitoring: boolean;
  quality: 'low' | 'medium' | 'high';
  adaptiveQuality: boolean;
}

export class PerformanceManager {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  
  // Performance components
  private fpsMonitor!: FPSMonitor;
  private touchOptimizer!: TouchOptimizer;
  private particleSystem!: ParticleSystem;
  private hapticFeedback!: HapticFeedback;
  
  // Object pools
  private coinPool!: ObjectPool<any>;
  private obstaclePool!: ObjectPool<any>;
  
  // Settings
  private settings: PerformanceSettings;
  private currentQuality: 'low' | 'medium' | 'high';
  
  // Adaptive quality
  private qualityCheckInterval: number | null = null;
  private performanceHistory: number[] = [];
  
  // Callbacks
  private onQualityChange?: (quality: string) => void;
  private onPerformanceUpdate?: (metrics: PerformanceMetrics) => void;

  constructor(canvas: HTMLCanvasElement, settings: Partial<PerformanceSettings> = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;
    
    this.settings = {
      targetFPS: 60,
      enableParticles: true,
      particleCount: 25,
      enableTouchOptimization: true,
      enableFPSMonitoring: true,
      quality: 'high',
      adaptiveQuality: true,
      ...settings,
    };
    
    this.currentQuality = this.settings.quality;
    
    this.initializeComponents();
    this.setupAdaptiveQuality();
  }

  /**
   * Initialize performance components
   */
  private initializeComponents(): void {
    // Initialize FPS monitor
    this.fpsMonitor = new FPSMonitor({
      targetFPS: this.settings.targetFPS,
      enableMemoryTracking: true,
    });
    
    // Initialize touch optimizer
    if (this.settings.enableTouchOptimization) {
      this.touchOptimizer = new TouchOptimizer(this.canvas);
    }
    
    // Initialize particle system
    if (this.settings.enableParticles) {
      this.particleSystem = new ParticleSystem(this.settings.particleCount);
    }
    
    // Initialize haptic feedback
    this.hapticFeedback = HapticFeedback.getInstance();
    
    // Initialize object pools
    this.initializeObjectPools();
    
    // Setup callbacks
    this.setupCallbacks();
  }

  /**
   * Initialize object pools for game entities
   */
  private initializeObjectPools(): void {
    // Create coin pool
    this.coinPool = new ObjectPool(
      () => ({
        x: 0, y: 0, z: 0,
        collected: false,
        id: '',
        reset() { this.x = this.y = this.z = 0; this.collected = false; this.id = ''; }
      }),
      50
    );
    
    // Create obstacle pool
    this.obstaclePool = new ObjectPool(
      () => ({
        x: 0, y: 0, z: 0,
        width: 0, height: 0, depth: 0,
        type: '', color: '#ff4444',
        reset() { 
          this.x = this.y = this.z = 0; 
          this.width = this.height = this.depth = 0; 
          this.type = ''; this.color = '#ff4444'; 
        }
      }),
      30
    );
  }

  /**
   * Setup performance callbacks
   */
  private setupCallbacks(): void {
    if (this.settings.enableFPSMonitoring) {
      this.fpsMonitor.setFPSUpdateCallback((metrics) => {
        this.onPerformanceUpdate?.(metrics);
        this.updatePerformanceHistory(metrics.fps);
      });
      
      this.fpsMonitor.setPerformanceWarningCallback((metrics) => {
        console.warn('Performance warning:', metrics);
        if (this.settings.adaptiveQuality) {
          this.adjustQualityDown();
        }
      });
    }
  }

  /**
   * Setup adaptive quality system
   */
  private setupAdaptiveQuality(): void {
    if (!this.settings.adaptiveQuality) return;
    
    this.qualityCheckInterval = setInterval(() => {
      this.checkPerformance();
    }, 5000) as unknown as number;
  }

  /**
   * Update performance history for adaptive quality
   */
  private updatePerformanceHistory(fps: number): void {
    this.performanceHistory.push(fps);
    if (this.performanceHistory.length > 10) {
      this.performanceHistory.shift();
    }
  }

  /**
   * Check performance and adjust quality if needed
   */
  private checkPerformance(): void {
    if (this.performanceHistory.length < 5) return;
    
    const avgFPS = this.performanceHistory.reduce((a, b) => a + b, 0) / this.performanceHistory.length;
    const targetFPS = this.settings.targetFPS;
    
    if (avgFPS < targetFPS * 0.8 && this.currentQuality !== 'low') {
      this.adjustQualityDown();
    } else if (avgFPS > targetFPS * 0.95 && this.currentQuality !== 'high') {
      this.adjustQualityUp();
    }
  }

  /**
   * Adjust quality down for better performance
   */
  private adjustQualityDown(): void {
    const qualities: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
    const currentIndex = qualities.indexOf(this.currentQuality);
    
    if (currentIndex > 0) {
      this.currentQuality = qualities[currentIndex - 1];
      this.applyQualitySettings(this.currentQuality);
      this.onQualityChange?.(this.currentQuality);
      console.log('Quality adjusted to:', this.currentQuality);
    }
  }

  /**
   * Adjust quality up for better visuals
   */
  private adjustQualityUp(): void {
    const qualities: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];
    const currentIndex = qualities.indexOf(this.currentQuality);
    
    if (currentIndex < qualities.length - 1) {
      this.currentQuality = qualities[currentIndex + 1];
      this.applyQualitySettings(this.currentQuality);
      this.onQualityChange?.(this.currentQuality);
      console.log('Quality adjusted to:', this.currentQuality);
    }
  }

  /**
   * Apply quality settings
   */
  private applyQualitySettings(quality: 'low' | 'medium' | 'high'): void {
    switch (quality) {
      case 'low':
        this.settings.enableParticles = false;
        this.settings.particleCount = 10;
        this.ctx.imageSmoothingEnabled = false;
        break;
        
      case 'medium':
        this.settings.enableParticles = true;
        this.settings.particleCount = 25;
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'medium';
        break;
        
      case 'high':
        this.settings.enableParticles = true;
        this.settings.particleCount = 50;
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        break;
    }
    
    // Update particle system
    if (this.particleSystem) {
      this.particleSystem.clear();
    }
  }

  /**
   * Start performance monitoring
   */
  start(): void {
    if (this.settings.enableFPSMonitoring) {
      this.fpsMonitor.start();
    }
  }

  /**
   * Stop performance monitoring
   */
  stop(): void {
    if (this.settings.enableFPSMonitoring) {
      this.fpsMonitor.stop();
    }
  }

  /**
   * Begin frame monitoring
   */
  beginFrame(): void {
    this.fpsMonitor.beginFrame();
  }

  /**
   * Begin update phase
   */
  beginUpdate(): void {
    this.fpsMonitor.beginUpdate();
  }

  /**
   * End update phase
   */
  endUpdate(): void {
    this.fpsMonitor.endUpdate();
  }

  /**
   * Begin render phase
   */
  beginRender(): void {
    this.fpsMonitor.beginRender();
  }

  /**
   * End render phase
   */
  endRender(): void {
    this.fpsMonitor.endRender();
    this.fpsMonitor.endFrame();
  }

  /**
   * Get coin from pool
   */
  getCoin(): any {
    return this.coinPool.get();
  }

  /**
   * Release coin to pool
   */
  releaseCoin(coin: any): void {
    this.coinPool.release(coin);
  }

  /**
   * Get obstacle from pool
   */
  getObstacle(): any {
    return this.obstaclePool.get();
  }

  /**
   * Release obstacle to pool
   */
  releaseObstacle(obstacle: any): void {
    this.obstaclePool.release(obstacle);
  }

  /**
   * Create particle effect
   */
  createParticles(x: number, y: number, count: number, color: string = '#ffffff'): void {
    if (this.particleSystem && this.settings.enableParticles) {
      this.particleSystem.createBurst(x, y, count, color);
    }
  }

  /**
   * Update particle system
   */
  updateParticles(deltaTime: number): void {
    if (this.particleSystem) {
      this.particleSystem.update(deltaTime);
    }
  }

  /**
   * Render particle system
   */
  renderParticles(): void {
    if (this.particleSystem) {
      this.particleSystem.render(this.ctx);
    }
  }

  /**
   * Trigger haptic feedback
   */
  triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'error'): void {
    this.hapticFeedback[type]();
  }

  /**
   * Set touch callbacks
   */
  setTouchCallbacks(callbacks: {
    onSwipe?: (gesture: any) => void;
    onTap?: (x: number, y: number) => void;
    onTouchStart?: (x: number, y: number) => void;
    onTouchMove?: (x: number, y: number) => void;
    onTouchEnd?: (x: number, y: number) => void;
  }): void {
    if (this.touchOptimizer) {
      if (callbacks.onSwipe) this.touchOptimizer.setSwipeCallback(callbacks.onSwipe);
      if (callbacks.onTap) this.touchOptimizer.setTapCallback(callbacks.onTap);
      if (callbacks.onTouchStart) this.touchOptimizer.setTouchStartCallback(callbacks.onTouchStart);
      if (callbacks.onTouchMove) this.touchOptimizer.setTouchMoveCallback(callbacks.onTouchMove);
      if (callbacks.onTouchEnd) this.touchOptimizer.setTouchEndCallback(callbacks.onTouchEnd);
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return this.fpsMonitor.getCurrentMetrics();
  }

  /**
   * Get performance report
   */
  getReport(): any {
    return this.fpsMonitor.getReport();
  }

  /**
   * Get current quality
   */
  getCurrentQuality(): string {
    return this.currentQuality;
  }

  /**
   * Manually set quality
   */
  setQuality(quality: 'low' | 'medium' | 'high'): void {
    this.currentQuality = quality;
    this.applyQualitySettings(quality);
    this.onQualityChange?.(quality);
  }

  /**
   * Set quality change callback
   */
  setQualityChangeCallback(callback: (quality: string) => void): void {
    this.onQualityChange = callback;
  }

  /**
   * Set performance update callback
   */
  setPerformanceUpdateCallback(callback: (metrics: PerformanceMetrics) => void): void {
    this.onPerformanceUpdate = callback;
  }

  /**
   * Update settings
   */
  updateSettings(newSettings: Partial<PerformanceSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    
    if (newSettings.targetFPS) {
      this.fpsMonitor = new FPSMonitor({
        targetFPS: newSettings.targetFPS,
        enableMemoryTracking: true,
      });
    }
    
    if (newSettings.quality) {
      this.setQuality(newSettings.quality);
    }
  }

  /**
   * Get pool statistics
   */
  getPoolStats(): {
    coins: any;
    obstacles: any;
    particles: any;
  } {
    return {
      coins: this.coinPool.getStats(),
      obstacles: this.obstaclePool.getStats(),
      particles: this.particleSystem?.getStats() || null,
    };
  }

  /**
   * Clear all pools and systems
   */
  clear(): void {
    this.coinPool.releaseAll();
    this.obstaclePool.releaseAll();
    if (this.particleSystem) {
      this.particleSystem.clear();
    }
  }

  /**
   * Destroy performance manager
   */
  destroy(): void {
    this.stop();
    
    if (this.qualityCheckInterval) {
      clearInterval(this.qualityCheckInterval);
      this.qualityCheckInterval = null;
    }
    
    if (this.touchOptimizer) {
      this.touchOptimizer.destroy();
    }
    
    this.clear();
    
    this.onQualityChange = undefined;
    this.onPerformanceUpdate = undefined;
  }
}

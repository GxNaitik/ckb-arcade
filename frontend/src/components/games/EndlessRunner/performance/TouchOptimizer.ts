/**
 * Touch Input Optimizer for Mobile
 * Reduces touch latency and improves responsiveness
 */

export interface TouchPoint {
  id: number;
  x: number;
  y: number;
  startTime: number;
  lastTime: number;
  deltaX: number;
  deltaY: number;
  velocityX: number;
  velocityY: number;
}

export interface SwipeGesture {
  direction: 'left' | 'right' | 'up' | 'down';
  velocity: number;
  distance: number;
  duration: number;
}

export class TouchOptimizer {
  private canvas: HTMLCanvasElement;
  private touchPoints: Map<number, TouchPoint> = new Map();
  private swipeThreshold: number = 30;
  private velocityThreshold: number = 0.5;
  private maxTouchPoints: number = 2;
  private onSwipe?: (gesture: SwipeGesture) => void;
  private onTap?: (x: number, y: number) => void;
  private onTouchStart?: (x: number, y: number) => void;
  private onTouchMove?: (x: number, y: number) => void;
  private onTouchEnd?: (x: number, y: number) => void;

  // Performance optimization
  private rafId: number | null = null;
  private lastUpdateTime: number = 0;
  private updateInterval: number = 16; // ~60fps

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.setupEventListeners();
    this.optimizeCanvas();
  }

  /**
   * Setup touch event listeners with passive listeners for better performance
   */
  private setupEventListeners(): void {
    // Use passive listeners where possible for better scrolling performance
    this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { 
      passive: false,
      capture: true 
    });
    
    this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { 
      passive: false,
      capture: true 
    });
    
    this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this), { 
      passive: true 
    });
    
    this.canvas.addEventListener('touchcancel', this.handleTouchEnd.bind(this), { 
      passive: true 
    });

    // Prevent default touch behaviors
    this.canvas.style.touchAction = 'none';
  }

  /**
   * Optimize canvas for mobile performance
   */
  private optimizeCanvas(): void {
    // Enable hardware acceleration
    this.canvas.style.transform = 'translateZ(0)';
    this.canvas.style.willChange = 'transform';
    
    // Optimize for pixel density
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    
    if (dpr > 1) {
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;
      const ctx = this.canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    }
  }

  /**
   * Handle touch start event
   */
  private handleTouchStart(event: TouchEvent): void {
    event.preventDefault();
    
    const now = performance.now();
    
    for (let i = 0; i < event.changedTouches.length && i < this.maxTouchPoints; i++) {
      const touch = event.changedTouches[i];
      const rect = this.canvas.getBoundingClientRect();
      
      const touchPoint: TouchPoint = {
        id: touch.identifier,
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
        startTime: now,
        lastTime: now,
        deltaX: 0,
        deltaY: 0,
        velocityX: 0,
        velocityY: 0,
      };
      
      this.touchPoints.set(touch.identifier, touchPoint);
      this.onTouchStart?.(touchPoint.x, touchPoint.y);
    }
    
    this.scheduleUpdate();
  }

  /**
   * Handle touch move event
   */
  private handleTouchMove(event: TouchEvent): void {
    event.preventDefault();
    
    const now = performance.now();
    
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      const touchPoint = this.touchPoints.get(touch.identifier);
      
      if (touchPoint) {
        const rect = this.canvas.getBoundingClientRect();
        const newX = touch.clientX - rect.left;
        const newY = touch.clientY - rect.top;
        
        const deltaTime = now - touchPoint.lastTime;
        if (deltaTime > 0) {
          touchPoint.deltaX = newX - touchPoint.x;
          touchPoint.deltaY = newY - touchPoint.y;
          touchPoint.velocityX = touchPoint.deltaX / deltaTime;
          touchPoint.velocityY = touchPoint.deltaY / deltaTime;
        }
        
        touchPoint.x = newX;
        touchPoint.y = newY;
        touchPoint.lastTime = now;
        
        this.onTouchMove?.(touchPoint.x, touchPoint.y);
      }
    }
  }

  /**
   * Handle touch end event
   */
  private handleTouchEnd(event: TouchEvent): void {
    const now = performance.now();
    
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      const touchPoint = this.touchPoints.get(touch.identifier);
      
      if (touchPoint) {
        const duration = now - touchPoint.startTime;
        const distance = Math.sqrt(
          Math.pow(touchPoint.deltaX, 2) + Math.pow(touchPoint.deltaY, 2)
        );
        const velocity = Math.sqrt(
          Math.pow(touchPoint.velocityX, 2) + Math.pow(touchPoint.velocityY, 2)
        );
        
        // Detect swipe gesture
        if (distance > this.swipeThreshold && velocity > this.velocityThreshold) {
          const direction = this.getSwipeDirection(touchPoint.deltaX, touchPoint.deltaY);
          const gesture: SwipeGesture = {
            direction,
            velocity,
            distance,
            duration,
          };
          this.onSwipe?.(gesture);
        } else if (duration < 200 && distance < 10) {
          // Detect tap
          this.onTap?.(touchPoint.x, touchPoint.y);
        }
        
        this.onTouchEnd?.(touchPoint.x, touchPoint.y);
        this.touchPoints.delete(touch.identifier);
      }
    }
  }

  /**
   * Get swipe direction from delta values
   */
  private getSwipeDirection(deltaX: number, deltaY: number): 'left' | 'right' | 'up' | 'down' {
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    
    if (absX > absY) {
      return deltaX > 0 ? 'right' : 'left';
    } else {
      return deltaY > 0 ? 'down' : 'up';
    }
  }

  /**
   * Schedule update using requestAnimationFrame for better performance
   */
  private scheduleUpdate(): void {
    if (this.rafId) return;
    
    const update = (now: number) => {
      if (now - this.lastUpdateTime >= this.updateInterval) {
        this.update(now);
        this.lastUpdateTime = now;
      }
      
      if (this.touchPoints.size > 0) {
        this.rafId = requestAnimationFrame(update);
      } else {
        this.rafId = null;
      }
    };
    
    this.rafId = requestAnimationFrame(update);
  }

  /**
   * Update touch points (called by requestAnimationFrame)
   */
  private update(now: number): void {
    // Update touch point velocities and handle any continuous gestures
    for (const touchPoint of this.touchPoints.values()) {
      const deltaTime = now - touchPoint.lastTime;
      
      // Decay velocity over time
      if (deltaTime > 50) {
        touchPoint.velocityX *= 0.9;
        touchPoint.velocityY *= 0.9;
      }
    }
  }

  /**
   * Set swipe callback
   */
  setSwipeCallback(callback: (gesture: SwipeGesture) => void): void {
    this.onSwipe = callback;
  }

  /**
   * Set tap callback
   */
  setTapCallback(callback: (x: number, y: number) => void): void {
    this.onTap = callback;
  }

  /**
   * Set touch start callback
   */
  setTouchStartCallback(callback: (x: number, y: number) => void): void {
    this.onTouchStart = callback;
  }

  /**
   * Set touch move callback
   */
  setTouchMoveCallback(callback: (x: number, y: number) => void): void {
    this.onTouchMove = callback;
  }

  /**
   * Set touch end callback
   */
  setTouchEndCallback(callback: (x: number, y: number) => void): void {
    this.onTouchEnd = callback;
  }

  /**
   * Configure touch sensitivity
   */
  configure(options: {
    swipeThreshold?: number;
    velocityThreshold?: number;
    maxTouchPoints?: number;
    updateInterval?: number;
  }): void {
    if (options.swipeThreshold !== undefined) {
      this.swipeThreshold = options.swipeThreshold;
    }
    if (options.velocityThreshold !== undefined) {
      this.velocityThreshold = options.velocityThreshold;
    }
    if (options.maxTouchPoints !== undefined) {
      this.maxTouchPoints = options.maxTouchPoints;
    }
    if (options.updateInterval !== undefined) {
      this.updateInterval = options.updateInterval;
    }
  }

  /**
   * Get current touch statistics
   */
  getStats() {
    return {
      activeTouches: this.touchPoints.size,
      maxTouchPoints: this.maxTouchPoints,
      swipeThreshold: this.swipeThreshold,
      velocityThreshold: this.velocityThreshold,
      updateInterval: this.updateInterval,
    };
  }

  /**
   * Destroy touch optimizer and clean up event listeners
   */
  destroy(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    
    this.touchPoints.clear();
    this.onSwipe = undefined;
    this.onTap = undefined;
    this.onTouchStart = undefined;
    this.onTouchMove = undefined;
    this.onTouchEnd = undefined;
  }
}

/**
 * Haptic feedback helper for mobile devices
 */
export class HapticFeedback {
  private static instance: HapticFeedback;
  private enabled: boolean = true;

  static getInstance(): HapticFeedback {
    if (!HapticFeedback.instance) {
      HapticFeedback.instance = new HapticFeedback();
    }
    return HapticFeedback.instance;
  }

  /**
   * Light haptic feedback for taps
   */
  light(): void {
    if (!this.enabled || !('vibrate' in navigator)) return;
    navigator.vibrate(10);
  }

  /**
   * Medium haptic feedback for interactions
   */
  medium(): void {
    if (!this.enabled || !('vibrate' in navigator)) return;
    navigator.vibrate(25);
  }

  /**
   * Heavy haptic feedback for important events
   */
  heavy(): void {
    if (!this.enabled || !('vibrate' in navigator)) return;
    navigator.vibrate([50, 30, 50]);
  }

  /**
   * Success haptic pattern
   */
  success(): void {
    if (!this.enabled || !('vibrate' in navigator)) return;
    navigator.vibrate([10, 50, 10]);
  }

  /**
   * Error haptic pattern
   */
  error(): void {
    if (!this.enabled || !('vibrate' in navigator)) return;
    navigator.vibrate([100, 50, 100]);
  }

  /**
   * Enable/disable haptic feedback
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if haptic feedback is available
   */
  isAvailable(): boolean {
    return 'vibrate' in navigator;
  }
}

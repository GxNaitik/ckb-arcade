/**
 * Object Pool for Performance Optimization
 * Reuses objects to reduce garbage collection and improve performance
 */

export interface PoolableObject {
  reset(): void;
  update?(deltaTime: number): void;
  render?(ctx: CanvasRenderingContext2D): void;
}

export class ObjectPool<T extends PoolableObject> {
  private pool: T[] = [];
  private active: T[] = [];
  private createFn: () => T;
  private maxSize: number;

  constructor(createFn: () => T, maxSize: number = 100) {
    this.createFn = createFn;
    this.maxSize = maxSize;
  }

  /**
   * Get an object from the pool
   */
  get(): T {
    let obj = this.pool.pop();
    if (!obj) {
      obj = this.createFn();
    }
    this.active.push(obj);
    return obj;
  }

  /**
   * Return an object to the pool
   */
  release(obj: T): void {
    const index = this.active.indexOf(obj);
    if (index !== -1) {
      this.active.splice(index, 1);
      obj.reset();
      
      if (this.pool.length < this.maxSize) {
        this.pool.push(obj);
      }
    }
  }

  /**
   * Release all active objects
   */
  releaseAll(): void {
    while (this.active.length > 0) {
      const obj = this.active.pop()!;
      obj.reset();
      
      if (this.pool.length < this.maxSize) {
        this.pool.push(obj);
      }
    }
  }

  /**
   * Update all active objects
   */
  update(deltaTime: number): void {
    for (const obj of this.active) {
      if (obj.update) {
        obj.update(deltaTime);
      }
    }
  }

  /**
   * Render all active objects
   */
  render(ctx: CanvasRenderingContext2D): void {
    for (const obj of this.active) {
      if (obj.render) {
        obj.render(ctx);
      }
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      poolSize: this.pool.length,
      activeCount: this.active.length,
      totalCreated: this.pool.length + this.active.length,
      maxSize: this.maxSize,
    };
  }

  /**
   * Clear the pool
   */
  clear(): void {
    this.pool.length = 0;
    this.active.length = 0;
  }
}

/**
 * Coin object for pooling
 */
export class PooledCoin implements PoolableObject {
  x: number = 0;
  y: number = 0;
  z: number = 0;
  collected: boolean = false;
  id: string = '';

  reset(): void {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.collected = false;
    this.id = '';
  }

  update(_deltaTime: number): void {
    // Update coin animation or behavior
    // TODO: Implement coin animation logic
  }

  render(_ctx: CanvasRenderingContext2D): void {
    // Render coin
    // TODO: Implement coin rendering logic
  }
}

/**
 * Obstacle object for pooling
 */
export class PooledObstacle implements PoolableObject {
  x: number = 0;
  y: number = 0;
  z: number = 0;
  width: number = 0;
  height: number = 0;
  depth: number = 0;
  type: string = '';
  color: string = '#ff4444';

  reset(): void {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.width = 0;
    this.height = 0;
    this.depth = 0;
    this.type = '';
    this.color = '#ff4444';
  }

  update(_deltaTime: number): void {
    // Update obstacle animation or behavior
    // TODO: Implement obstacle animation logic
  }

  render(_ctx: CanvasRenderingContext2D): void {
    // Render obstacle
    // TODO: Implement obstacle rendering logic
  }
}

/**
 * Particle object for effects
 */
export class PooledParticle implements PoolableObject {
  x: number = 0;
  y: number = 0;
  vx: number = 0;
  vy: number = 0;
  life: number = 1;
  maxLife: number = 1;
  color: string = '#ffffff';
  size: number = 1;

  reset(): void {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.life = 1;
    this.maxLife = 1;
    this.color = '#ffffff';
    this.size = 1;
  }

  update(deltaTime: number): void {
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
    this.life -= deltaTime / this.maxLife;
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (this.life <= 0) return;
    
    ctx.save();
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Particle system for visual effects
 */
export class ParticleSystem {
  private particlePool: ObjectPool<PooledParticle>;
  private activeParticles: PooledParticle[] = [];

  constructor(maxParticles: number = 50) {
    this.particlePool = new ObjectPool(
      () => new PooledParticle(),
      maxParticles
    );
  }

  /**
   * Create particle burst
   */
  createBurst(x: number, y: number, count: number, color: string = '#ffffff'): void {
    for (let i = 0; i < count; i++) {
      const particle = this.particlePool.get();
      particle.x = x;
      particle.y = y;
      particle.vx = (Math.random() - 0.5) * 200;
      particle.vy = (Math.random() - 0.5) * 200;
      particle.life = 1;
      particle.maxLife = 0.5 + Math.random() * 0.5;
      particle.color = color;
      particle.size = 2 + Math.random() * 3;
      this.activeParticles.push(particle);
    }
  }

  /**
   * Update particle system
   */
  update(deltaTime: number): void {
    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const particle = this.activeParticles[i];
      particle.update(deltaTime);
      
      if (particle.life <= 0) {
        this.particlePool.release(particle);
        this.activeParticles.splice(i, 1);
      }
    }
  }

  /**
   * Render particle system
   */
  render(ctx: CanvasRenderingContext2D): void {
    for (const particle of this.activeParticles) {
      particle.render(ctx);
    }
  }

  /**
   * Clear all particles
   */
  clear(): void {
    for (const particle of this.activeParticles) {
      this.particlePool.release(particle);
    }
    this.activeParticles.length = 0;
  }

  /**
   * Get particle system stats
   */
  getStats() {
    return {
      activeParticles: this.activeParticles.length,
      poolStats: this.particlePool.getStats(),
    };
  }
}

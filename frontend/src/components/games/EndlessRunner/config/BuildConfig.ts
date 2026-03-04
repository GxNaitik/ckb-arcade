/**
 * Build Configuration for Production Deployment
 * Optimizes build settings for different environments
 */

export interface BuildEnvironment {
  name: string;
  mode: 'development' | 'production';
  target: 'web' | 'mobile';
  optimization: boolean;
  sourcemap: boolean;
  minify: boolean;
  bundleAnalysis: boolean;
}

export interface PerformanceConfig {
  enableServiceWorker: boolean;
  enableCaching: boolean;
  enableCompression: boolean;
  enableLazyLoading: boolean;
  imageOptimization: boolean;
  codeSplitting: boolean;
}

export interface DeploymentConfig {
  baseUrl: string;
  apiEndpoint: string;
  ckbNetwork: 'testnet' | 'mainnet';
  gameContractAddress: string;
  enableAnalytics: boolean;
  enableErrorReporting: boolean;
}

export const BUILD_ENVIRONMENTS: Record<string, BuildEnvironment> = {
  development: {
    name: 'Development',
    mode: 'development',
    target: 'web',
    optimization: false,
    sourcemap: true,
    minify: false,
    bundleAnalysis: false,
  },
  
  'staging': {
    name: 'Staging',
    mode: 'production',
    target: 'web',
    optimization: true,
    sourcemap: true,
    minify: true,
    bundleAnalysis: true,
  },
  
  'production-web': {
    name: 'Production Web',
    mode: 'production',
    target: 'web',
    optimization: true,
    sourcemap: false,
    minify: true,
    bundleAnalysis: false,
  },
  
  'production-mobile': {
    name: 'Production Mobile',
    mode: 'production',
    target: 'mobile',
    optimization: true,
    sourcemap: false,
    minify: true,
    bundleAnalysis: false,
  },
};

export const PERFORMANCE_CONFIG: PerformanceConfig = {
  enableServiceWorker: true,
  enableCaching: true,
  enableCompression: true,
  enableLazyLoading: true,
  imageOptimization: true,
  codeSplitting: true,
};

export const DEPLOYMENT_CONFIG: Record<string, DeploymentConfig> = {
  development: {
    baseUrl: 'http://localhost:3000',
    apiEndpoint: 'http://localhost:3001/api',
    ckbNetwork: 'testnet',
    gameContractAddress: 'ckb1qyq...dev-contract',
    enableAnalytics: false,
    enableErrorReporting: false,
  },
  
  staging: {
    baseUrl: 'https://staging.ckb-arcade.com',
    apiEndpoint: 'https://api-staging.ckb-arcade.com',
    ckbNetwork: 'testnet',
    gameContractAddress: 'ckb1qyq...staging-contract',
    enableAnalytics: true,
    enableErrorReporting: true,
  },
  
  production: {
    baseUrl: 'https://ckb-arcade.com',
    apiEndpoint: 'https://api.ckb-arcade.com',
    ckbNetwork: 'mainnet',
    gameContractAddress: 'ckb1qyq...production-contract',
    enableAnalytics: true,
    enableErrorReporting: true,
  },
};

/**
 * Get current build environment
 */
export function getCurrentBuildEnvironment(): BuildEnvironment {
  const env = import.meta.env.MODE || 'development';
  return BUILD_ENVIRONMENTS[env] || BUILD_ENVIRONMENTS.development;
}

/**
 * Get current deployment configuration
 */
export function getCurrentDeploymentConfig(): DeploymentConfig {
  const env = import.meta.env.MODE || 'development';
  return DEPLOYMENT_CONFIG[env] || DEPLOYMENT_CONFIG.development;
}

/**
 * Get environment-specific game settings
 */
export function getGameSettings() {
  const buildEnv = getCurrentBuildEnvironment();
  const deployConfig = getCurrentDeploymentConfig();
  
  return {
    // Performance settings based on target
    targetFPS: buildEnv.target === 'mobile' ? 30 : 60,
    enableParticles: buildEnv.target !== 'mobile',
    particleCount: buildEnv.target === 'mobile' ? 15 : 50,
    enableTouchOptimization: buildEnv.target === 'mobile',
    enableFPSMonitoring: buildEnv.mode === 'development',
    
    // Network settings
    ckbNetwork: deployConfig.ckbNetwork,
    gameContractAddress: deployConfig.gameContractAddress,
    
    // Feature flags
    enableAnalytics: deployConfig.enableAnalytics,
    enableErrorReporting: deployConfig.enableErrorReporting,
    enableDebugMode: buildEnv.mode === 'development',
  };
}

/**
 * Vite build configuration
 */
export const VITE_CONFIG = {
  // Base configuration
  base: './',
  
  // Build optimization
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: getCurrentBuildEnvironment().sourcemap,
    minify: getCurrentBuildEnvironment().minify ? 'terser' : false,
    
    // Chunk optimization
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ckb: ['@ckb-ccc/connector-react'],
          game: [
            './components/games/EndlessRunner',
            './components/games/EndlessRunner/engine',
            './components/games/EndlessRunner/systems',
          ],
          ui: [
            './components/ui',
            './components/common',
          ],
        },
      },
    },
    
    // Asset optimization
    assetsInlineLimit: 4096,
    
    // Compression
    cssCodeSplit: true,
    
    // Terser options for production
    terserOptions: getCurrentBuildEnvironment().mode === 'production' ? {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug'],
      },
      mangle: {
        safari10: true,
      },
    } : undefined,
  },
  
  // Development server
  server: {
    port: 3000,
    host: true,
    open: true,
  },
  
  // Preview server
  preview: {
    port: 4173,
    host: true,
  },
  
  // Plugins
  plugins: [],
  
  // Define constants
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
    __ENVIRONMENT__: JSON.stringify(import.meta.env.MODE),
  },
};

/**
 * Service worker configuration
 */
export const SERVICE_WORKER_CONFIG = {
  name: 'ckb-arcade-sw',
  version: '1.0.0',
  
  // Cache strategies
  cacheStrategies: {
    static: {
      strategy: 'CacheFirst',
      cacheName: 'static-cache',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
    
    api: {
      strategy: 'NetworkFirst',
      cacheName: 'api-cache',
      maxAge: 5 * 60 * 1000, // 5 minutes
    },
    
    images: {
      strategy: 'CacheFirst',
      cacheName: 'image-cache',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  },
  
  // Precache assets
  precacheAssets: [
    '/',
    '/index.html',
    '/manifest.json',
    '/favicon.ico',
    '/assets/icon-192x192.png',
    '/assets/icon-512x512.png',
  ],
  
  // Runtime caching
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/api\.ckb-arcade\.com\/.*/,
      strategy: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 300, // 5 minutes
        },
      },
    },
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif)$/,
      strategy: 'CacheFirst',
      options: {
        cacheName: 'image-cache',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 604800, // 7 days
        },
      },
    },
  ],
};

/**
 * PWA configuration
 */
export const PWA_CONFIG = {
  name: 'CKB Arcade',
  shortName: 'CKB Arcade',
  description: 'Play arcade games and earn CKB rewards',
  themeColor: '#39ff14',
  backgroundColor: '#000000',
  display: 'standalone',
  orientation: 'landscape',
  
  // Icons
  icons: [
    {
      src: '/assets/icon-72x72.png',
      sizes: '72x72',
      type: 'image/png',
    },
    {
      src: '/assets/icon-96x96.png',
      sizes: '96x96',
      type: 'image/png',
    },
    {
      src: '/assets/icon-128x128.png',
      sizes: '128x128',
      type: 'image/png',
    },
    {
      src: '/assets/icon-144x144.png',
      sizes: '144x144',
      type: 'image/png',
    },
    {
      src: '/assets/icon-152x152.png',
      sizes: '152x152',
      type: 'image/png',
    },
    {
      src: '/assets/icon-192x192.png',
      sizes: '192x192',
      type: 'image/png',
    },
    {
      src: '/assets/icon-384x384.png',
      sizes: '384x384',
      type: 'image/png',
    },
    {
      src: '/assets/icon-512x512.png',
      sizes: '512x512',
      type: 'image/png',
    },
  ],
  
  // Splash screens
  splashScreens: [
    {
      src: '/assets/splash-640x1136.png',
      sizes: '640x1136',
      type: 'image/png',
    },
    {
      src: '/assets/splash-750x1334.png',
      sizes: '750x1334',
      type: 'image/png',
    },
    {
      src: '/assets/splash-1242x2208.png',
      sizes: '1242x2208',
      type: 'image/png',
    },
  ],
  
  // Categories
  categories: ['games', 'entertainment'],
  
  // Screenshots
  screenshots: [
    {
      src: '/assets/screenshot-1.png',
      sizes: '1280x720',
      type: 'image/png',
      form_factor: 'wide',
    },
    {
      src: '/assets/screenshot-2.png',
      sizes: '640x1136',
      type: 'image/png',
      form_factor: 'narrow',
    },
  ],
};

/**
 * Analytics configuration
 */
export const ANALYTICS_CONFIG = {
  enabled: getCurrentDeploymentConfig().enableAnalytics,
  
  // Google Analytics
  googleAnalytics: {
    measurementId: import.meta.env.VITE_GA_MEASUREMENT_ID,
    enableDebug: import.meta.env.MODE === 'development',
  },
  
  // Custom analytics
  customAnalytics: {
    endpoint: `${getCurrentDeploymentConfig().apiEndpoint}/analytics`,
    batchSize: 10,
    flushInterval: 30000, // 30 seconds
  },
  
  // Events to track
  events: {
    gameStart: 'game_start',
    gameEnd: 'game_end',
    transactionStart: 'transaction_start',
    transactionComplete: 'transaction_complete',
    walletConnect: 'wallet_connect',
    walletDisconnect: 'wallet_disconnect',
    error: 'error',
  },
};

/**
 * Error reporting configuration
 */
export const ERROR_REPORTING_CONFIG = {
  enabled: getCurrentDeploymentConfig().enableErrorReporting,
  
  // Sentry configuration
  sentry: {
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: process.env.npm_package_version || '1.0.0',
  },
  
  // Custom error reporting
  customErrorReporting: {
    endpoint: `${getCurrentDeploymentConfig().apiEndpoint}/errors`,
    batchSize: 5,
    flushInterval: 10000, // 10 seconds
  },
  
  // Error filters
  filters: [
    // Filter out common development errors
    'ResizeObserver loop limit exceeded',
    'Network request failed',
  ],
};

export default {
  BUILD_ENVIRONMENTS,
  PERFORMANCE_CONFIG,
  DEPLOYMENT_CONFIG,
  VITE_CONFIG,
  SERVICE_WORKER_CONFIG,
  PWA_CONFIG,
  ANALYTICS_CONFIG,
  ERROR_REPORTING_CONFIG,
  getCurrentBuildEnvironment,
  getCurrentDeploymentConfig,
  getGameSettings,
};

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'


// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'CKB Arcade - Endless Runner',
        short_name: 'CKB Arcade',
        description: 'Play endless runner games and earn CKB rewards',
        theme_color: '#39ff14',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'landscape',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.ckb-arcade\.com\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 300 // 5 minutes
              }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 604800 // 7 days
              }
            }
          }
        ]
      }
    })
  ],

  // Base configuration — use '/' for Vercel deployment (absolute paths)
  base: '/',

  // Build optimization
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: process.env.NODE_ENV === 'development',
    // Use esbuild (Vite default) instead of terser — terser breaks Lit web components
    // used by @ckb-ccc/connector-react
    minify: 'esbuild',

    // Chunk optimization
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ckb: ['@ckb-ccc/connector-react'],
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },

    // Asset optimization
    assetsInlineLimit: 4096,
    cssCodeSplit: true,
    reportCompressedSize: true
  },

  server: {
    port: 3000,
    host: true,
    open: true,
    cors: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },

  preview: {
    port: 4173,
    host: true,
    cors: true
  },

  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@ckb-ccc/connector-react'
    ]
  },

  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
    __ENVIRONMENT__: JSON.stringify(process.env.NODE_ENV || 'development'),
    __CKB_NETWORK__: JSON.stringify(process.env.VITE_CKB_NETWORK || 'testnet'),
    __GAME_CONTRACT__: JSON.stringify(process.env.VITE_GAME_CONTRACT || 'ckb1qyq...testnet')
  }
})

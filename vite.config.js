import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  // Development server configuration
  server: {
    host: '0.0.0.0', // Listen on all interfaces for Docker
    port: 5173,
    strictPort: true, // Fail if port is already in use

    // HMR configuration for Docker
    hmr: {
      port: 5173,
      host: 'localhost',
    },

    // Watch options for better file detection in Docker
    watch: {
      usePolling: true, // Required for Docker on some systems
      interval: 1000,
    },

    // CORS configuration for development
    cors: true,

    // Proxy API calls to the Express server
    proxy: {
      '/api': {
        target: 'http://localhost:5555',
        changeOrigin: true,
        secure: false,
      },
      '/health': {
        target: 'http://localhost:5555',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  // Build configuration
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,

    // Generate manifest for SSR
    manifest: true,

    // Rollup options
    rollupOptions: {
      input: {
        main: './src/client.jsx',
      },
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ui: ['@mui/material', 'lucide-react'],
        },
      },
    },

    // Source maps for debugging
    sourcemap: true,

    // Minification
    minify: 'esbuild',

    // Target modern browsers in development
    target: 'esnext',
  },

  // Resolve configuration
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      '@components': new URL('./src/components', import.meta.url).pathname,
      '@hooks': new URL('./hooks', import.meta.url).pathname,
      '@constants': new URL('./constants', import.meta.url).pathname,
    },
  },

  // Environment variables
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV === 'development'),
  },

  // Optimizations
  optimizeDeps: {
    include: ['react', 'react-dom', '@mui/material', 'lucide-react'],
    exclude: [
      // Exclude any problematic dependencies
    ],
  },

  // CSS configuration
  css: {
    devSourcemap: true,
  },

  // Preview server (for testing production builds)
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
  },
});

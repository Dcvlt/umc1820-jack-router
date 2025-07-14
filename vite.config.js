import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Ensure Vite runs on a specific port (5173 is the default)
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: true,
    hmr: {
      overlay: true,
      clientPort: 5173,
      path: '/hmr',
      protocol: 'ws',
      force: true,
    },
  },
  build: {
    // ... your existing build config
    outDir: 'dist/client',
    manifest: true, // Important for production builds
    rollupOptions: {
      input: {
        main: './src/client.jsx',
      },
    },
  },
});

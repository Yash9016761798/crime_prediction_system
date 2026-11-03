import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        // Fallback for any code that calls a relative /api path in dev.
        '/api': {
          target: process.env.VITE_DEV_API_TARGET || 'http://localhost:5000',
          changeOrigin: true,
        },
        '/uploads': {
          target: process.env.VITE_DEV_API_TARGET || 'http://localhost:5000',
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/scheduler')) return 'vendor-react';
            if (id.includes('node_modules/@reduxjs/toolkit') || id.includes('node_modules/react-redux') || id.includes('node_modules/redux-persist') || id.includes('node_modules/redux')) return 'vendor-redux';
            if (id.includes('node_modules/recharts')) return 'vendor-recharts';
            if (id.includes('node_modules/leaflet') || id.includes('node_modules/@react-leaflet') || id.includes('node_modules/react-leaflet')) return 'vendor-leaflet';
            if (id.includes('node_modules/lucide-react')) return 'vendor-ui';
            if (id.includes('node_modules/@tailwindcss') || id.includes('node_modules/tailwindcss')) return 'vendor-css';
            if (id.includes('node_modules')) return 'vendor-other';
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      css: true,
    },
  };
});

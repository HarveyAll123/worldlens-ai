import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Cesium's pre-built Workers/Assets/Widgets are copied to public/cesium by
// scripts/copy-cesium.mjs (predev/prebuild); CESIUM_BASE_URL tells Cesium where they are.
const cesiumBaseUrl = 'cesium';

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`),
  },
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8787',
        changeOrigin: false,
      },
    },
  },
  preview: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8787',
        changeOrigin: false,
      },
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/cesium') || id.includes('node_modules/@cesium'))
            return 'cesium';
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler'))
            return 'react';
          return undefined;
        },
      },
    },
  },
});

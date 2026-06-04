import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 開發時代理到本地後端
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          charts: ['recharts'],
          lwcharts: ['lightweight-charts'],
        },
      },
    },
  },
  define: {
    // 讓生產環境可以讀到環境變數
    __API_URL__: JSON.stringify(process.env.VITE_API_URL || ''),
    __WS_URL__: JSON.stringify(process.env.VITE_WS_URL || ''),
  },
});

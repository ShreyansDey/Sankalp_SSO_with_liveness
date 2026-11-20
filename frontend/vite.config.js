import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    host: true,
    allowedHosts: true,
    proxy: {
      '/auth': {
        target: 'http://localhost:8001',
        changeOrigin: true
      },
      '/admin': {
        target: 'http://localhost:8001',
        changeOrigin: true
      },
      '/liveness': {
        target: 'http://localhost:8001',
        changeOrigin: true
      },
      '/sso': {
        target: 'http://localhost:8001',
        changeOrigin: true
      },
      '/authorize': {
        target: 'http://localhost:8001',
        changeOrigin: true
      },
      '/token': {
        target: 'http://localhost:8001',
        changeOrigin: true
      },
      '/userinfo': {
        target: 'http://localhost:8001',
        changeOrigin: true
      },
      '/me': {
        target: 'http://localhost:8001',
        changeOrigin: true
      },
      '/health': {
        target: 'http://localhost:8001',
        changeOrigin: true
      }
    }
  }
});

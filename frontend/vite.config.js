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
        changeOrigin: true,
        bypass: (req) => {
          if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return '/index.html';
          }
        }
      },
      '/liveness': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        bypass: (req) => {
          if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return '/index.html';
          }
        }
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
      },
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true
      },
      '/.well-known': {
        target: 'http://localhost:8001',
        changeOrigin: true
      },
      '/app-a': {
        target: 'http://localhost:5174',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/app-a/, '') || '/'
      },
      '/app-b': {
        target: 'http://localhost:5175',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/app-b/, '') || '/'
      },
      '/app-c': {
        target: 'http://localhost:5176',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/app-c/, '') || '/'
      },
      '/app-d': {
        target: 'http://localhost:5177',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/app-d/, '') || '/'
      },
      '/app-e': {
        target: 'http://localhost:5178',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/app-e/, '') || '/'
      }
    }
  }
});

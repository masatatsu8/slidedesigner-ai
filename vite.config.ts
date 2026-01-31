import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 4100,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://localhost:4101',
            changeOrigin: true,
          },
        },
      },
      plugins: [react()],
      define: {
        // Gemini API
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        // デフォルトユーザー設定
        'process.env.DEFAULT_USER_ID': JSON.stringify(env.DEFAULT_USER_ID),
        'process.env.DEFAULT_USER_NAME': JSON.stringify(env.DEFAULT_USER_NAME),
        'process.env.DEFAULT_USER_EMAIL': JSON.stringify(env.DEFAULT_USER_EMAIL),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

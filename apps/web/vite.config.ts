import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4378,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4377',
      },
      '/ws': {
        target: 'http://127.0.0.1:4377',
        ws: true,
      },
    },
  },
});

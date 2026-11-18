import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    allowedHosts: [
      'airbnb710.com',
      'www.airbnb710.com',
      '.airbnb710.com',
      '.up.railway.app',
      'localhost',
      '127.0.0.1',
    ],
  },
  preview: {
    port: 4173,
    allowedHosts: [
      'airbnb710.com',
      'www.airbnb710.com',
      '.airbnb710.com',
      '.up.railway.app',
      'localhost',
      '127.0.0.1',
    ],
  },
});

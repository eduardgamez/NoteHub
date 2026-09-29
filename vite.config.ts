import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.NOTEHUB_BASE_PATH ?? '/',
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8787' } },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});

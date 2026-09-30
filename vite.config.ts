import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  base: process.env.NOTEHUB_BASE_PATH ?? '/',
  plugins: [react(), {
    name: 'notehub-service-worker-version',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== '/sw.js') return next();
        response.setHeader('Content-Type', 'application/javascript');
        response.setHeader('Cache-Control', 'no-store');
        response.end(`self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
 await Promise.all((await caches.keys()).filter(key => key.startsWith('notehub-shell-')).map(key => caches.delete(key)));
 await self.registration.unregister();
 for (const client of await self.clients.matchAll({type:'window'})) if (client.url.startsWith(self.registration.scope)) await client.navigate(client.url);
})()));`);
      });
    },
    writeBundle(options, bundle) {
      const hash = createHash('sha256');
      for (const name of Object.keys(bundle).sort()) {
        const item = bundle[name];
        hash.update(name);
        hash.update(item.type === 'chunk' ? item.code : item.source);
      }
      const path = resolve(options.dir ?? 'dist', 'sw.js');
      const source = readFileSync(path, 'utf8');
      writeFileSync(path, source.replace(/const CACHE = '[^']+';/, `const CACHE = 'notehub-shell-${hash.digest('hex').slice(0, 16)}';`));
    },
  }],
  server: { proxy: { '/api': 'http://localhost:8787' } },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});

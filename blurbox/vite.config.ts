/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Images never leave the device: the production page may not fetch, XHR or open sockets,
// and loads nothing from other origins. Dev mode skips this because Vite's HMR needs a
// websocket and an inline preamble script.
const CSP = [
  "default-src 'self'",
  "connect-src 'none'",
  "img-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'blurbox-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    ],
  };
}

export default defineConfig({
  plugins: [react(), contentSecurityPolicy()],
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: false },
  server: { port: 5173 },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
});

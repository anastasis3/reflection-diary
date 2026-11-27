/**
 * Build of the React front-end (client/ → dist/).
 *
 * Three pages, one bundle of shared code:
 *   index.html     the diary (React, hash routes #/today, #/profile …)
 *   reset.html     "set a new password", opened from the reset e-mail
 *   research.html  the researcher console
 *
 * `npm run dev:client` starts Vite with hot reload on :5173 and sends /api to
 * the Express server on :3000 (`npm run dev` in a second terminal).
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const page = (name) => fileURLToPath(new URL(`./client/${name}`, import.meta.url));

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: { main: page('index.html'), reset: page('reset.html'), research: page('research.html') },
    },
  },
  server: {
    proxy: { '/api': 'http://localhost:3000', '/docs': 'http://localhost:3000' },
  },
});

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Renderer React servito da src/renderer; base './' per il caricamento via file:// in produzione.
export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
});

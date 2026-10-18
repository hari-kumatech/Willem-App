import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`        -> dist/ met losse bestanden (voor een eigen webserver)
// `npm run build:single` -> dist/index.html als één bestand (voor publiceren als artifact of mailen)
export default defineConfig(({ mode }) => ({
  base: './',
  server: { open: true },
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
}));

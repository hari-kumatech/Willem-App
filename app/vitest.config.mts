import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // e2e/ is for Playwright (npm run test:e2e), not for vitest
  test: { exclude: ['node_modules/**', 'e2e/**', '.next/**'] },
});

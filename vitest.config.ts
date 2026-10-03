import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __DEV_TOOLS__: 'true' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});

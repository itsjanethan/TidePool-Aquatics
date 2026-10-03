import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Simulation tests run whole in-game days; CI runners are several times slower than a dev machine.
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 60_000 },
});

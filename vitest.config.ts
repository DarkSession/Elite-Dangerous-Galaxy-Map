import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // The two packages and the repository's own tests. `tests/` and `e2e/` belong to no
    // package, so one root run covers everything rather than a run per package.
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
  },
});

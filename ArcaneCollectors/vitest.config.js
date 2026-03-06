import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.js', 'tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/data/**', 'src/utils/**', 'src/systems/**'],
      exclude: ['src/scenes/**', 'src/components/**'],
    },
  },
});

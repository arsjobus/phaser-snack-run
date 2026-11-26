import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works on GitHub Pages and itch.io without config.
  base: './',
  // Keep Phaser's repeated source headers out of the generated bundle. Its MIT
  // license is distributed separately in public/PHASER-LICENSE.md.
  esbuild: {
    legalComments: 'none',
  },
  build: {
    chunkSizeWarningLimit: 1500, // Phaser is large
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

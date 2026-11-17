import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works on GitHub Pages and itch.io without config.
  base: './',
  build: {
    chunkSizeWarningLimit: 1500, // Phaser is large
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

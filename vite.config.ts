import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works on GitHub Pages and itch.io without config.
  base: './',
  // Keep Phaser's repeated source headers out of the generated bundle. Its MIT
  // license is distributed separately in public/assets/PHASER-LICENSE.md.
  esbuild: {
    legalComments: 'none',
  },
  build: {
    chunkSizeWarningLimit: 1500, // Phaser is large
    // Keep every generated file in the deployable assets directory.
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        assetFileNames: (asset) =>
          asset.name?.endsWith('.svg')
            ? 'assets/art/[name]-[hash][extname]'
            : 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

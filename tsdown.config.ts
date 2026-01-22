import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['./src/cli/index.ts', './src/sdk.ts'],
  clean: true,
  format: ['esm', 'cjs'],
  dts: {
    sourcemap: true,
  },
  platform: 'node',
  minify: true,
  exports: true,
});

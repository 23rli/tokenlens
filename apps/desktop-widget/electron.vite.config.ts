import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const pkgSrc = (name: string): string => resolve(__dirname, `../../packages/${name}/src/index.ts`);

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        // Pure, browser-safe packages aliased to source so the renderer can
        // score locally (demo resilience) without a prior dist build.
        '@ecoprompt/shared-types': pkgSrc('shared-types'),
        '@ecoprompt/scoring-engine': pkgSrc('scoring-engine'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } },
    },
    plugins: [react()],
  },
});

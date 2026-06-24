import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const r = (p) => resolve(__dirname, p);

export default defineConfig({
  resolve: {
    alias: {
      '@ecoprompt/shared-types': r('src/types/index.ts'),
      '@ecoprompt/scoring-engine': r('src/scoring/index.ts'),
      '@ecoprompt/llm-adapters': r('src/coaching/index.ts'),
      '@ecoprompt/ingestion': r('src/capture/parsers/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

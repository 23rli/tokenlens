import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const pkg = (name) => resolve(__dirname, `packages/${name}/src/index.ts`);

export default defineConfig({
  resolve: {
    alias: {
      '@ecoprompt/shared-types': pkg('shared-types'),
      '@ecoprompt/scoring-engine': pkg('scoring-engine'),
      '@ecoprompt/ingestion': pkg('ingestion'),
      '@ecoprompt/llm-adapters': pkg('llm-adapters'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/**/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
    },
  },
});

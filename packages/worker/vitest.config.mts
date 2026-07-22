import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
    }),
  ],
  test: {
    poolOptions: {
      workers: {
        // Resource-control decision: singleWorker prevents concurrent D1 database isolation conflicts
        singleWorker: true,
      },
    },
  },
});

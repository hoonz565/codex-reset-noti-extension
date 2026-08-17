/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect } from 'vitest';
import worker from '../../src/index';

// Import wrangler.toml raw
import tomlContent from '../../wrangler.toml?raw';
// Import index.ts raw
import indexContent from '../../src/index.ts?raw';

// Load all src files as raw strings (using the recommended Vite 5 format)
const allSrcFiles = import.meta.glob('../../src/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('Static Analysis Boundary and Cron Tests', () => {
  it('ORCH-CRON-1: wrangler.toml contains the approved Cron trigger and no duplicates', () => {
    const cronMatches = tomlContent.match(/crons\s*=\s*\[(.*?)\]/g);
    expect(cronMatches).toBeDefined();
    expect(cronMatches!.length).toBe(1); // No duplicates
    expect(cronMatches![0]).toContain('"*/15 * * * *"');
  });

  it('ORCH-SCHED-6: index.ts scheduled handler delegates only and contains no duplicated snapshot/event/delivery domain pipeline', () => {
    // index.ts should just call worker.scheduled
    expect(indexContent).not.toContain('SnapshotCheckResult');
    expect(indexContent).not.toContain('EventProcessingService');
    expect(indexContent).not.toContain('DeliveryDispatchService');
  });

  it('ORCH-BOUNDARY-4: No Cloudflare Queue producer or consumer is added', () => {
    // 1. No Queue binding in Env
    expect(indexContent).not.toContain('Queue<');
    expect(indexContent).not.toMatch(/queue\s*:/i);

    // 2. No queue producer/consumer config in wrangler.toml
    expect(tomlContent).not.toContain('[[queues.producers]]');
    expect(tomlContent).not.toContain('[[queues.consumers]]');

    // 3. No queue handler export
    expect((worker as any).queue).toBeUndefined();

    // 4. No Queue.send or sendBatch call in any src file
    for (const [path, content] of Object.entries(allSrcFiles)) {
      expect(content).not.toMatch(/\.sendBatch\s*\(/);
      // We allow emailProvider.send, but not queue.send
      expect(content).not.toMatch(/queue\.send\s*\(/i);
    }
  });

  it('ORCH-BOUNDARY-3: No probability90 or RESET_COMPLETED subscriber delivery exists', () => {
    // 1. No probability90 in the codebase
    for (const [path, content] of Object.entries(allSrcFiles)) {
      expect(content.toLowerCase()).not.toContain('probability90');
    }

    // 2. RESET_COMPLETED never creates subscriber delivery (verify delivery-preparation-service)
    const prepPath = Object.keys(allSrcFiles).find((p) =>
      p.includes('delivery-preparation-service.ts')
    );
    if (prepPath) {
      const prepContent = allSrcFiles[prepPath];
      // The preparation service explicitly rejects unsupported event types
      expect(prepContent).toContain(
        "event.type !== 'PROBABILITY_REACHED_70' && event.type !== 'RESET_ANNOUNCED'"
      );
      expect(prepContent).toContain("return { outcome: 'unsupported_event'");
    }
  });

  it('ORCH-BOUNDARY-1: No new source parser is implemented', () => {
    // Phase 7 should not import or implement source parsers
    const orchFiles = Object.entries(allSrcFiles).filter(([path]) =>
      path.includes('orchestration')
    );
    for (const [path, content] of orchFiles) {
      expect(content).not.toContain('raw-forecast-schema');
      expect(content).not.toContain('source-normalizer');
    }
  });

  it('ORCH-BOUNDARY-2: No new event precedence logic is implemented', () => {
    const orchFiles = Object.entries(allSrcFiles).filter(([path]) =>
      path.includes('orchestration')
    );
    for (const [path, content] of orchFiles) {
      expect(content).not.toContain('PROBABILITY_REACHED_70');
      expect(content).not.toContain('RESET_ANNOUNCED');
    }
  });

  it('ORCH-BOUNDARY-5: No provider webhook endpoint is added', () => {
    for (const [path, content] of Object.entries(allSrcFiles)) {
      expect(content.toLowerCase()).not.toContain('webhook');
    }
  });

  it('ORCH-BOUNDARY-6: No Phase 8 UI code is added', () => {
    for (const [path, content] of Object.entries(allSrcFiles)) {
      expect(content).not.toContain('/api/admin/dashboard');
    }
  });
});

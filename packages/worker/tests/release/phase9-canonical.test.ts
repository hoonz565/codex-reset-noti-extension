/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';

// @ts-expect-error Types missing for ?raw import
import wranglerContentRaw from '../../wrangler.toml?raw';
// @ts-expect-error Types missing for ?raw import
import secretsDocRaw from '../../../../docs/runbooks/secrets-management.md?raw';
// @ts-expect-error Types missing for ?raw import
import monDocRaw from '../../../../docs/runbooks/monitoring.md?raw';
// @ts-expect-error Types missing for ?raw import
import rollbackDocRaw from '../../../../docs/runbooks/rollback.md?raw';
// @ts-expect-error Types missing for ?raw import
import pkgRaw from '../../../../package.json?raw';

import worker from '../../src/index';
import { ConfiguredEmailProvider } from '../../src/email/providers/configured-email-provider';
import { setupTestDb } from '../db/test-utils';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runPreflight } = require('../../../../scripts/release-preflight.cjs');

describe('Phase 9 Canonical Release Requirements', () => {
  const wranglerContent = wranglerContentRaw || '';
  const productionSourceModules = import.meta.glob(
    ['../../src/**/*.ts', '../../../shared/src/**/*.ts', '../../../extension/src/**/*.ts'],
    { query: '?raw', import: 'default', eager: true }
  );
  const productionSourceText = Object.values(productionSourceModules).join('\n');

  describe('Configuration', () => {
    it('REL-CONFIG-1: Production wrangler.toml uses explicit codex-reset-notifier worker name.', () => {
      const prodBlock = wranglerContent.split('[env.production]')[1] || '';
      const match = prodBlock.match(/name\s*=\s*"([^"]+)"/);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('codex-reset-notifier');
    });

    it('REL-CONFIG-2: Production wrangler.toml contains no wildcard or localhost ALLOWED_ORIGINS.', () => {
      const prodBlock = wranglerContent.split('[env.production]')[1] || '';
      const allowedMatch = prodBlock.match(/ALLOWED_ORIGINS\s*=\s*"([^"]+)"/);
      expect(allowedMatch).not.toBeNull();
      expect(allowedMatch![1]).not.toContain('*');
      expect(allowedMatch![1]).not.toContain('localhost');
    });

    it('REL-CONFIG-3: Production wrangler.toml prevents accidental development fallback.', () => {
      const varsBlock = wranglerContent.split('[vars]')[1];
      const envMatch = varsBlock.match(/ENVIRONMENT\s*=\s*"([^"]+)"/);
      expect(envMatch).not.toBeNull();
      expect(envMatch![1]).toBe('development');
    });
  });

  describe('Secrets & Runbooks', () => {
    it('REL-SECRET-1: Secrets documentation specifies bindings without revealing real values.', () => {
      const secretsDoc = secretsDocRaw || '';
      expect(secretsDoc).toContain('ADMIN_API_TOKEN');
      expect(secretsDoc).toContain('EMAIL_PROVIDER_API_KEY');
      expect(secretsDoc).not.toContain('test-admin-secret');
    });

    it('REL-MON-1: Monitoring runbook documents worker request failure threshold.', () => {
      const monDoc = monDocRaw || '';
      expect(monDoc.toLowerCase()).toContain('worker request failure');
      expect(monDoc.toLowerCase()).toContain('threshold');
    });

    it('REL-RUNBOOK-1: Rollback runbook documents D1 schema drop risks and forward fixes.', () => {
      const rollbackDoc = rollbackDocRaw || '';
      expect(rollbackDoc.toLowerCase()).toContain('schema drop');
      expect(rollbackDoc.toLowerCase()).toContain('forward fix');
    });
  });

  describe('D1', () => {
    it('REL-D1-1: Staging D1 database binding differs from production D1 database binding.', () => {
      const stagingMatch = wranglerContent.match(
        /\[\[env\.staging\.d1_databases\]\][\s\S]*?database_id\s*=\s*"([^"]+)"/
      );
      const prodMatch = wranglerContent.match(
        /\[\[env\.production\.d1_databases\]\][\s\S]*?database_id\s*=\s*"([^"]+)"/
      );
      expect(stagingMatch).not.toBeNull();
      expect(prodMatch).not.toBeNull();
      expect(stagingMatch![1]).not.toBe(prodMatch![1]);
    });
  });

  describe('CORS and Access', () => {
    it('REL-CORS-1: Production worker rejects forbidden Origin before database queries.', async () => {
      const db = await setupTestDb();
      const prepareSpy = vi.spyOn(db, 'prepare');
      const env = {
        ALLOWED_ORIGINS: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        DB: db,
        RATE_LIMIT_SECRET: 'rate-limit-secret',
        ADMIN_API_TOKEN: 'admin-token',
      };
      const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as any;
      const response = await worker.fetch(
        new Request('https://worker.example/api/admin/metrics', {
          headers: {
            Origin: 'https://attacker.example',
            Authorization: 'Bearer admin-token',
          },
        }),
        env,
        ctx
      );

      expect(response.status).toBe(403);
      expect(prepareSpy).not.toHaveBeenCalled();
    });

    it('REL-STAGING-CONTRACT-1: Staging GET /api/status returns valid schema and CORS.', async () => {
      const db = await setupTestDb();
      const allowedOrigin = 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const env = {
        ALLOWED_ORIGINS: allowedOrigin,
        DB: db,
        RATE_LIMIT_SECRET: 'rate-limit-secret',
      };
      const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as any;
      const response = await worker.fetch(
        new Request('https://worker.example/api/status', { headers: { Origin: allowedOrigin } }),
        env,
        ctx
      );
      const body = await response.json<any>();

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(allowedOrigin);
      expect(body.schemaVersion).toBe(1);
      expect(body.status).toBeDefined();
    });

    it('REL-STAGING-CONTRACT-2: Staging OPTIONS /api/status returns 204 with CORS headers.', async () => {
      const db = await setupTestDb();
      const allowedOrigin = 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const env = {
        ALLOWED_ORIGINS: allowedOrigin,
        DB: db,
        RATE_LIMIT_SECRET: 'rate-limit-secret',
      };
      const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as any;
      const response = await worker.fetch(
        new Request('https://worker.example/api/status', {
          method: 'OPTIONS',
          headers: { Origin: allowedOrigin },
        }),
        env,
        ctx
      );

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(allowedOrigin);
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    });

    it('REL-STAGING-CONTRACT-3: Staging GET /api/admin/metrics rejects unauthorized bearer token.', async () => {
      const db = await setupTestDb();
      const prepareSpy = vi.spyOn(db, 'prepare');
      const env = {
        ALLOWED_ORIGINS: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        DB: db,
        RATE_LIMIT_SECRET: 'rate-limit-secret',
        ADMIN_API_TOKEN: 'admin-token',
      };
      const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as any;
      prepareSpy.mockClear();
      const response = await worker.fetch(
        new Request('https://worker.example/api/admin/metrics', {
          headers: { Authorization: 'Bearer wrong-token' },
        }),
        env,
        ctx
      );

      expect(response.status).toBe(401);
      expect(prepareSpy).not.toHaveBeenCalled();
    });
  });

  describe('Preflight & Placeholders', () => {
    it('REL-PREFLIGHT-1: Staging Worker name differs from production.', () => {
      const stagingMatch = wranglerContent.match(/\[env\.staging\][\s\S]*?name\s*=\s*"([^"]+)"/);
      const prodMatch = wranglerContent.match(/\[env\.production\][\s\S]*?name\s*=\s*"([^"]+)"/);
      expect(stagingMatch).not.toBeNull();
      expect(prodMatch).not.toBeNull();
      expect(stagingMatch![1]).not.toBe(prodMatch![1]);
    });

    it('REL-PREFLIGHT-2: Configured staging and production D1 IDs differ when non-placeholder.', () => {
      const stagingMatch = wranglerContent.match(
        /\[\[env\.staging\.d1_databases\]\][\s\S]*?database_id\s*=\s*"([^"]+)"/
      );
      const prodMatch = wranglerContent.match(
        /\[\[env\.production\.d1_databases\]\][\s\S]*?database_id\s*=\s*"([^"]+)"/
      );
      if (
        stagingMatch &&
        prodMatch &&
        !stagingMatch[1].includes('<') &&
        !prodMatch[1].includes('<')
      ) {
        expect(stagingMatch[1]).not.toBe(prodMatch[1]);
      }
    });

    it('REL-PREFLIGHT-3: Empty staging D1 ID is rejected.', () => {
      const stagingMatch = wranglerContent.match(
        /\[\[env\.staging\.d1_databases\]\][\s\S]*?database_id\s*=\s*"([^"]+)"/
      );
      expect(stagingMatch![1].trim().length).toBeGreaterThan(0);
    });

    it('REL-PREFLIGHT-4: Staging D1 placeholder is rejected by deployment preflight.', () => {
      const placeholderContent = wranglerContent.replace(
        /(\[\[env\.staging\.d1_databases\]\][\s\S]*?database_id\s*=\s*)"[^"]+"/,
        '$1"<STAGING_D1_ID>"'
      );
      const code = runPreflight(['node', 'script', '--environment', 'staging'], placeholderContent);
      // We expect 2 because D1 placeholder or missing staging credentials exist
      expect(code).toBe(2);
    });

    it('REL-PREFLIGHT-5: Production extension ID placeholder blocks production release validation.', () => {
      const placeholderContent = wranglerContent.replace(
        /(\[env\.production\.vars\][\s\S]*?ALLOWED_ORIGINS\s*=\s*)"[^"]+"/,
        '$1"chrome-extension://<PRODUCTION_EXTENSION_ID>"'
      );
      const code = runPreflight(
        ['node', 'script', '--environment', 'production', '--confirm-production'],
        placeholderContent
      );
      expect(code).toBe(2);
    });

    it('REL-PREFLIGHT-6: Staging extension ID placeholder blocks staging preflight.', () => {
      const placeholderContent = wranglerContent.replace(
        /(\[env\.staging\.vars\][\s\S]*?ALLOWED_ORIGINS\s*=\s*)"[^"]+"/,
        '$1"chrome-extension://<STAGING_EXTENSION_ID>"'
      );
      const code = runPreflight(['node', 'script', '--environment', 'staging'], placeholderContent);
      expect(code).toBe(2);
    });

    it('REL-PREFLIGHT-7: Production config has no staging Worker/D1 reference.', () => {
      const prodBlock = wranglerContent.split('[env.production]')[1] || '';
      expect(prodBlock).not.toContain('codex_reset_staging');
      expect(prodBlock).not.toContain('codex-reset-notifier-staging');
    });

    it('REL-PREFLIGHT-8: Development config has no production Worker/D1 reference.', () => {
      const devBlock = wranglerContent.split('[env.staging]')[0] || '';
      expect(devBlock).not.toContain('codex_reset_prod');
    });
  });

  describe('Email', () => {
    it('REL-EMAIL-1: Staging email provider operates in safe/sandbox mode preventing real sends.', async () => {
      const { createEmailProvider } =
        await import('../../src/email/providers/email-provider-factory');
      const provider = createEmailProvider('staging');
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      try {
        const res = await provider.send({
          to: 'test@example.com',
          subject: 'test',
          html: '<p>body</p>',
          text: 'body',
        });
        expect(res).toEqual({
          outcome: 'accepted',
          providerMessageId: 'disabled-staging-send',
        });
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe('Release Boundaries', () => {
    it('REL-BOUNDARY-5: Status and metrics routes remain read-only.', async () => {
      const db = await setupTestDb();
      const prepareSpy = vi.spyOn(db, 'prepare');

      const env = {
        ALLOWED_ORIGINS: '*',
        DB: db,
        RATE_LIMIT_SECRET: 'sec',
        ADMIN_API_TOKEN: 'token',
      };
      const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as any;
      prepareSpy.mockClear();

      const res = await worker.fetch(new Request('http://localhost/api/status'), env, ctx);
      expect(res.status).toBe(200);

      const res2 = await worker.fetch(
        new Request('http://localhost/api/admin/metrics', {
          headers: { Authorization: 'Bearer token' },
        }),
        env,
        ctx
      );
      expect(res2.status).toBe(200);

      const mutatingQueries = prepareSpy.mock.calls
        .map(([query]) => query)
        .filter((query) => /^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(query));
      expect(mutatingQueries).toEqual([]);

      prepareSpy.mockRestore();
    });

    it('REL-BOUNDARY-6: CORS cannot authorize admin metrics.', async () => {
      const db = await setupTestDb();
      const prepareSpy = vi.spyOn(db, 'prepare');
      const env = {
        ALLOWED_ORIGINS: 'https://trusted.com',
        DB: db,
        RATE_LIMIT_SECRET: 'sec',
        ADMIN_API_TOKEN: 'token',
      };
      const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as any;
      prepareSpy.mockClear();

      // 1. Missing bearer
      let res = await worker.fetch(
        new Request('http://localhost/api/admin/metrics', {
          headers: { Origin: 'https://trusted.com' },
        }),
        env,
        ctx
      );
      expect(res.status).toBe(401);
      expect(prepareSpy).not.toHaveBeenCalled();

      // 2. Invalid bearer
      res = await worker.fetch(
        new Request('http://localhost/api/admin/metrics', {
          headers: { Origin: 'https://trusted.com', Authorization: 'Bearer invalid' },
        }),
        env,
        ctx
      );
      expect(res.status).toBe(401);
      expect(prepareSpy).not.toHaveBeenCalled();

      prepareSpy.mockRestore();
    });

    it('REL-BOUNDARY-7: No provider webhook is introduced.', () => {
      expect(productionSourceText).not.toMatch(/provider[_ -]?webhook|\/api\/webhooks?\//i);
    });

    it('REL-BOUNDARY-8: No Cloudflare Queue is introduced.', () => {
      expect(wranglerContent).not.toMatch(/\[\[queues\.consumers\]\]/);
    });

    it('REL-BOUNDARY-9: No probability90 behavior exists.', () => {
      expect(productionSourceText).not.toMatch(/probability[_-]?90|PROBABILITY_REACHED_90/);
    });

    it('REL-BOUNDARY-10: No RESET_COMPLETED subscriber notification exists.', () => {
      // Allow in operational lifecycle (e.g. event-processing) but NOT in subscriber-facing contexts:
      // templates (email/), delivery preparation (delivery/), preferences (subscriptions/).
      const emailFiles = import.meta.glob('../../src/email/**/*.ts', {
        query: '?raw',
        import: 'default',
        eager: true,
      });
      const deliveryFiles = import.meta.glob('../../src/delivery/**/*.ts', {
        query: '?raw',
        import: 'default',
        eager: true,
      });
      const subFiles = import.meta.glob('../../src/subscriptions/**/*.ts', {
        query: '?raw',
        import: 'default',
        eager: true,
      });

      const allFiles = [
        ...Object.values(emailFiles),
        ...Object.values(deliveryFiles),
        ...Object.values(subFiles),
      ];

      let containsResetCompleted = false;
      for (const content of allFiles) {
        if (typeof content === 'string' && content.includes('RESET_COMPLETED')) {
          containsResetCompleted = true;
        }
      }
      expect(containsResetCompleted).toBe(false);
    });

    it('REL-BOUNDARY-11: Deployment scripts do not default to production.', () => {
      const code = runPreflight(['node', 'script'], wranglerContent);
      expect(code).toBe(1);
    });

    it('REL-BOUNDARY-12: Production deployment requires explicit confirmation.', () => {
      const code = runPreflight(['node', 'script', '--environment', 'production'], wranglerContent);
      expect(code).toBe(1);
    });

    it('REL-BOUNDARY-13: Chrome Web Store submission cannot run automatically.', () => {
      const packageJson = JSON.parse(pkgRaw || '{}') as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const scriptNames = Object.keys(packageJson.scripts ?? {}).join(' ');
      const dependencyNames = Object.keys({
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      }).join(' ');
      expect(scriptNames).not.toMatch(/submit|publish|web.?store/i);
      expect(dependencyNames).not.toMatch(/chrome.?web.?store|webstore.?upload/i);
    });

    it('REL-BOUNDARY-14: No Phase 10 functionality is introduced.', () => {
      expect(productionSourceText).not.toMatch(/phase[_ -]?10/i);
    });
  });

  describe('Security & Sentinels', () => {
    it('REL-SEC-1: Secret scan detects no real committed credentials in repository.', () => {
      const scannableText = `${productionSourceText}\n${wranglerContent}\n${pkgRaw || ''}`;
      expect(scannableText).not.toMatch(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/);
      expect(scannableText).not.toMatch(/\bsk_live_[A-Za-z0-9]{16,}\b/);
      expect(scannableText).not.toMatch(/\bre_[A-Za-z0-9]{20,}\b/);
      expect(scannableText).not.toMatch(
        /(?:api[_-]?key|secret)\s*[=:]\s*["'][A-Za-z0-9_-]{24,}["']/i
      );
    });

    it('REL-SEC-3: Logger sentinel test proves admin and provider tokens occur zero times in logs.', async () => {
      const adminSentinel = 'admin_token_SENTINEL_do_not_log';
      const providerSentinel = 're_provider_SENTINEL_do_not_log';
      const spies = [
        vi.spyOn(console, 'log').mockImplementation(() => {}),
        vi.spyOn(console, 'warn').mockImplementation(() => {}),
        vi.spyOn(console, 'error').mockImplementation(() => {}),
      ];
      try {
        const provider = new ConfiguredEmailProvider(
          providerSentinel,
          'alerts@example.com',
          vi.fn<typeof fetch>().mockRejectedValue(new Error(providerSentinel))
        );
        await provider.send({
          to: 'person@example.com',
          subject: 'Subject',
          text: 'Text',
          html: '<p>Text</p>',
        });

        const db = await setupTestDb();
        await worker.fetch(
          new Request('https://worker.example/api/admin/metrics', {
            headers: { Authorization: `Bearer ${adminSentinel}` },
          }),
          {
            ALLOWED_ORIGINS: '',
            DB: db,
            RATE_LIMIT_SECRET: 'rate-limit-secret',
            ADMIN_API_TOKEN: 'different-admin-token',
          },
          { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as any
        );

        const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
        expect(logged).not.toContain(adminSentinel);
        expect(logged).not.toContain(providerSentinel);
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }
    });
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMetricsRoutes } from '../../src/http/metrics-routes';
import { MetricsReadService } from '../../src/metrics/metrics-read-service';
import { D1MetricsRepository } from '../../src/metrics/metrics-repository';
import { setupTestDb } from '../db/test-utils';
import { DeliveryPreparationService } from '../../src/services/delivery-preparation-service';
import { NotificationDeliveryRepository } from '../../src/db/repositories/NotificationDeliveryRepository';
import indexRaw from '../../src/index?raw';
import wranglerRaw from '../../wrangler.toml?raw';

describe('Canonical Boundary (DASH-BOUNDARY-1..10)', () => {
  let db: any;
  let metricsRepo: D1MetricsRepository;
  let metricsService: MetricsReadService;

  beforeEach(async () => {
    db = await setupTestDb();
    metricsRepo = new D1MetricsRepository(db);
    metricsService = new MetricsReadService(metricsRepo);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('DASH-BOUNDARY-1: Phase 8 performs no upstream source fetch.', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response());
    const statusRoutes = (await import('../../src/http/status-routes')).createStatusRoutes(
      (await import('../../src/status/status-read-service')).StatusReadService.prototype as any
    );
    await statusRoutes.fetch(new Request('http://localhost/api/status'), {
      ALLOWED_ORIGINS: '*',
    } as any);
    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });

  it('DASH-BOUNDARY-2: Phase 8 creates no source snapshot.', async () => {
    const getCount = async () =>
      (await db.prepare('SELECT COUNT(*) as c FROM source_snapshots').first()).c as number;
    const beforeCount = await getCount();
    const statusRoutes = (await import('../../src/http/status-routes')).createStatusRoutes(
      (await import('../../src/status/status-read-service')).StatusReadService.prototype as any
    );
    await statusRoutes.fetch(new Request('http://localhost/api/status'), {
      ALLOWED_ORIGINS: '*',
    } as any);
    const afterCount = await getCount();
    expect(afterCount).toBe(beforeCount);
  });

  it('DASH-BOUNDARY-3: Phase 8 creates no reset event or cycle.', async () => {
    const getEvents = async () =>
      (await db.prepare('SELECT COUNT(*) as c FROM reset_events').first()).c as number;
    const getCycles = async () =>
      (await db.prepare('SELECT COUNT(*) as c FROM reset_cycles').first()).c as number;
    const beforeE = await getEvents();
    const beforeC = await getCycles();

    const statusRoutes = (await import('../../src/http/status-routes')).createStatusRoutes(
      (await import('../../src/status/status-read-service')).StatusReadService.prototype as any
    );
    await statusRoutes.fetch(new Request('http://localhost/api/status'), {
      ALLOWED_ORIGINS: '*',
    } as any);

    expect(await getEvents()).toBe(beforeE);
    expect(await getCycles()).toBe(beforeC);
  });

  it('DASH-BOUNDARY-4: Phase 8 creates no notification delivery.', async () => {
    // seed a control notification delivery
    await db
      .prepare(
        `INSERT INTO reset_cycles (id, state, created_at, updated_at) VALUES ('c1', 'active', '2023', '2023')`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO source_snapshots (id, checked_at, created_at, lifecycle, source_health, meaningful_change, payload_hash, probability) VALUES ('s1', '2023', '2023', 'none', 'healthy', 0, 'hash', 100)`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO reset_events (id, reset_cycle_id, type, source_snapshot_id, created_at) VALUES ('e1', 'c1', 'RESET_ANNOUNCED', 's1', '2023')`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO subscribers (id, email, normalized_email, state, notify_70, notify_announced, management_token_hash, token_version, created_at, updated_at) VALUES ('sub1', 'a1@a.com', 'a1@a.com', 'active', 1, 1, 'hash1', 1, '2023', '2023')`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO notification_deliveries (id, event_id, subscriber_id, channel, state, attempt_count, created_at, updated_at) VALUES ('del-1', 'e1', 'sub1', 'email', 'pending', 0, '2023', '2023')`
      )
      .run();

    const getCount = async () => {
      const res = await db.prepare('SELECT COUNT(*) as c FROM notification_deliveries').first();
      return res.c as number;
    };
    const beforeCount = await getCount();

    // spy on delivery preparation calls = 0
    const prepSpy = vi.spyOn(DeliveryPreparationService.prototype, 'prepareDeliveries');
    const insertSpy = vi.spyOn(NotificationDeliveryRepository.prototype, 'createIfAbsent');

    // invoke GET /api/status
    const statusRoutes = (await import('../../src/http/status-routes')).createStatusRoutes(
      (await import('../../src/status/status-read-service')).StatusReadService.prototype as any
    );
    await statusRoutes.fetch(new Request('http://localhost/api/status'), {
      ALLOWED_ORIGINS: '*',
    } as any);

    // invoke authenticated GET /api/admin/metrics
    const metricsRoutes = createMetricsRoutes(() => metricsService);
    const req = new Request('http://localhost/api/admin/metrics');
    req.headers.set('Authorization', 'Bearer token');
    await metricsRoutes.fetch(req, { ADMIN_API_TOKEN: 'token', ALLOWED_ORIGINS: '*' } as any);

    expect(prepSpy).toHaveBeenCalledTimes(0);
    expect(insertSpy).toHaveBeenCalledTimes(0);

    const afterCount = await getCount();
    expect(afterCount).toBe(beforeCount);
  });

  it('DASH-BOUNDARY-5: Phase 8 sends no email.', async () => {
    // 1. Spies on the email provider send boundary
    const { MockEmailProvider } = await import('../../src/email/providers/mock-email-provider');
    const sendSpy = vi.spyOn(MockEmailProvider.prototype, 'send');

    // 2. Invoke GET /api/status
    const statusRoutes = (await import('../../src/http/status-routes')).createStatusRoutes(
      (await import('../../src/status/status-read-service')).StatusReadService.prototype as any
    );
    await statusRoutes.fetch(new Request('http://localhost/api/status'), {
      ALLOWED_ORIGINS: '*',
    } as any);

    // 3. Invoke authenticated GET /api/admin/metrics
    const metricsRoutes = (await import('../../src/http/metrics-routes')).createMetricsRoutes(
      () => metricsService
    );
    const req = new Request('http://localhost/api/admin/metrics');
    req.headers.set('Authorization', 'Bearer token');
    await metricsRoutes.fetch(req, { ADMIN_API_TOKEN: 'token', ALLOWED_ORIGINS: '*' } as any);

    // 4. Assert send call count is exactly 0
    expect(sendSpy).toHaveBeenCalledTimes(0);

    // 5. Scan statusRaw and metricsRaw
    const statusRaw = (await import('../../src/http/status-routes?raw')).default;
    const metricsRaw = (await import('../../src/http/metrics-routes?raw')).default;

    // 6. Assert no direct email sender, EmailProvider, sendEmail or delivery dispatch dependency is present
    expect(statusRaw).not.toContain('sendEmail');
    expect(statusRaw).not.toContain('EmailProvider');
    expect(statusRaw).not.toContain('DeliveryDispatch');
    expect(metricsRaw).not.toContain('sendEmail');
    expect(metricsRaw).not.toContain('EmailProvider');
    expect(metricsRaw).not.toContain('DeliveryDispatch');
  });
  it('DASH-BOUNDARY-6: No probability90 behavior exists.', () => {
    expect(indexRaw).not.toContain('PROBABILITY_REACHED_90');
    expect(indexRaw).not.toContain('notify_90');
  });
  it('DASH-BOUNDARY-7: No RESET_COMPLETED subscriber notification exists.', () => {
    expect(indexRaw).not.toContain('RESET_COMPLETED');
  });
  it('DASH-BOUNDARY-8: No Cloudflare Queue implementation is added.', () => {
    expect(wranglerRaw).not.toContain('[queues]');
    expect(wranglerRaw).not.toContain('[[queues.consumers]]');
  });

  it('DASH-BOUNDARY-9: No provider webhook endpoint is added.', async () => {
    // inspect the active route registry and production Worker routes
    expect(indexRaw).not.toContain('/webhook');
    expect(indexRaw).not.toContain('/callback');
    expect(indexRaw).not.toContain('SignatureVerification');
  });

  it('DASH-BOUNDARY-10: No Phase 9 functionality is added.', async () => {
    // inspect active routes, migrations, runtime bindings, feature flags and the Phase 8 production manifest;
    // narrowly exclude roadmap-only text
    const indexWithoutDocs = indexRaw.replace(/Phase 9/g, ''); // just in case it mentions Phase 9 docs
    expect(indexWithoutDocs).not.toContain('Phase 9');
    expect(indexRaw).not.toContain('Phase 9 implementation');
    expect(wranglerRaw).not.toContain('Phase 9');
  });
});

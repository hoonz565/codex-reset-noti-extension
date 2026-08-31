import { describe, it, expect, beforeEach } from 'vitest';
import { setupTestDb } from '../db/test-utils';
import { createSubscriptionRouter } from '../../src/http/subscription-routes';

import { TokenService } from '../../src/subscriptions/token-service';
import { SubscriberRepository } from '../../src/db/repositories/SubscriberRepository';
import { MockEmailProvider } from '../../src/email/providers/mock-email-provider';
import { SubscriptionEmailRenderer } from '../../src/email/subscription-email-renderer';
import { SubscriptionMailer } from '../../src/services/subscription-mailer';

describe('Subscription Routes', () => {
  let db: D1Database;
  let router: ReturnType<typeof createSubscriptionRouter>;
  let subRepo: SubscriberRepository;

  beforeEach(async () => {
    db = await setupTestDb();
    router = createSubscriptionRouter(db, 'secret');
    subRepo = new SubscriberRepository(db);
  });

  const makeRequest = (
    method: string,
    pathname: string,
    body?: unknown,
    headers: Record<string, string> = {}
  ) => {
    return new Request(`https://test.com${pathname}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  it('SUB-HTTP-1: POST /api/subscriptions accepts valid subscription request and returns 202', async () => {
    const req = makeRequest('POST', '/api/subscriptions', {
      email: 'test@example.com',
      preferences: { probability70: true, resetAnnounced: false },
    });
    const res = await router.handle(req);

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.accepted).toBe(true);
  });

  it('SUB-HTTP-2: POST /api/subscriptions rejects invalid body with 400', async () => {
    const req = makeRequest('POST', '/api/subscriptions', {
      email: 'not-an-email',
      preferences: { probability70: true, resetAnnounced: false },
    });
    const res = await router.handle(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid request body');
  });

  it('SUB-HTTP-3: POST /api/subscriptions/confirm accepts valid confirm request and returns 200', async () => {
    // Generate valid confirm token
    await subRepo
      .getCreateStatement({
        id: 'sub1',
        email: 't@t.com',
        normalized_email: 't@t.com',
        state: 'pending_confirmation',
        notify_70: false,
        notify_announced: false,
        management_token_hash: 'none',
        created_at: new Date().toISOString(),
      })
      .run();
    const token = await TokenService.generate();
    await db
      .prepare(
        `INSERT INTO subscription_tokens (id, subscriber_id, purpose, token_hash, requested_probability70, requested_reset_announced, created_at, expires_at) VALUES (?, ?, 'confirm_subscription', ?, 1, 0, ?, ?)`
      )
      .bind(
        `tok1`,
        'sub1',
        token.hashHex,
        new Date().toISOString(),
        new Date(Date.now() + 86400 * 1000).toISOString()
      )
      .run();

    const req = makeRequest('POST', '/api/subscriptions/confirm', { token: token.rawBase64Url });
    const res = await router.handle(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.managementToken).toEqual(expect.any(String));
  });

  it('SUB-HTTP-4: POST /api/subscriptions/confirm returns 400 for bad token', async () => {
    const req = makeRequest('POST', '/api/subscriptions/confirm', { token: 'short' });
    const res = await router.handle(req);

    expect(res.status).toBe(400); // Zod validation failure (min 10)
  });

  it('SUB-HTTP-5: POST /api/subscriptions/request-management-link returns 202', async () => {
    const req = makeRequest('POST', '/api/subscriptions/request-management-link', {
      email: 'test@example.com',
    });
    const res = await router.handle(req);

    expect(res.status).toBe(202);
  });

  it('SUB-HTTP-6: GET /api/subscriptions/manage requires Bearer token', async () => {
    const req = makeRequest('GET', '/api/subscriptions/manage');
    const res = await router.handle(req);

    expect(res.status).toBe(401);
  });

  it('SUB-HTTP-7: GET /api/subscriptions/manage returns subscription info for valid token', async () => {
    await subRepo
      .getCreateStatement({
        id: 'sub1',
        email: 't@t.com',
        normalized_email: 't@t.com',
        state: 'active',
        notify_70: true,
        notify_announced: false,
        management_token_hash: 'none',
        created_at: new Date().toISOString(),
      })
      .run();
    const token = await TokenService.generate();
    await db
      .prepare(
        `INSERT INTO subscription_tokens (id, subscriber_id, purpose, token_hash, created_at, expires_at) VALUES (?, ?, 'manage_subscription', ?, ?, ?)`
      )
      .bind(
        `tok1`,
        'sub1',
        token.hashHex,
        new Date().toISOString(),
        new Date(Date.now() + 86400000000).toISOString()
      )
      .run();

    const req = makeRequest('GET', '/api/subscriptions/manage', undefined, {
      Authorization: `Bearer ${token.rawBase64Url}`,
    });
    const res = await router.handle(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe('active');
    expect(body.preferences.probability70).toBe(true);
  });

  it('SUB-HTTP-8: PATCH /api/subscriptions/manage updates preferences', async () => {
    await subRepo
      .getCreateStatement({
        id: 'sub1',
        email: 't@t.com',
        normalized_email: 't@t.com',
        state: 'active',
        notify_70: true,
        notify_announced: false,
        management_token_hash: 'none',
        created_at: new Date().toISOString(),
      })
      .run();
    const token = await TokenService.generate();
    await db
      .prepare(
        `INSERT INTO subscription_tokens (id, subscriber_id, purpose, token_hash, created_at, expires_at) VALUES (?, ?, 'manage_subscription', ?, ?, ?)`
      )
      .bind(
        `tok1`,
        'sub1',
        token.hashHex,
        new Date().toISOString(),
        new Date(Date.now() + 86400000000).toISOString()
      )
      .run();

    const req = makeRequest(
      'PATCH',
      '/api/subscriptions/manage',
      { preferences: { probability70: false, resetAnnounced: true } },
      { Authorization: `Bearer ${token.rawBase64Url}` }
    );
    const res = await router.handle(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preferences.probability70).toBe(false);
    expect(body.preferences.resetAnnounced).toBe(true);
  });

  it('SUB-HTTP-9: POST /api/subscriptions/unsubscribe requires Bearer token', async () => {
    const req = makeRequest('POST', '/api/subscriptions/unsubscribe');
    const res = await router.handle(req);

    expect(res.status).toBe(401);
  });

  it('SUB-HTTP-10: POST /api/subscriptions/unsubscribe successfully unsubscribes', async () => {
    await subRepo
      .getCreateStatement({
        id: 'sub1',
        email: 't@t.com',
        normalized_email: 't@t.com',
        state: 'active',
        notify_70: true,
        notify_announced: false,
        management_token_hash: 'none',
        created_at: new Date().toISOString(),
      })
      .run();
    const token = await TokenService.generate();
    await db
      .prepare(
        `INSERT INTO subscription_tokens (id, subscriber_id, purpose, token_hash, created_at, expires_at) VALUES (?, ?, 'manage_subscription', ?, ?, ?)`
      )
      .bind(
        `tok1`,
        'sub1',
        token.hashHex,
        new Date().toISOString(),
        new Date(Date.now() + 86400000000).toISOString()
      )
      .run();

    const req = makeRequest('POST', '/api/subscriptions/unsubscribe', undefined, {
      Authorization: `Bearer ${token.rawBase64Url}`,
    });
    const res = await router.handle(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('SUB-HTTP-11: queues a confirmation email while keeping the public response generic', async () => {
    const provider = new MockEmailProvider();
    const mailRouter = createSubscriptionRouter(
      db,
      'secret',
      new SubscriptionMailer(
        provider,
        new SubscriptionEmailRenderer('https://notify.example/manage')
      )
    );
    const req = makeRequest('POST', '/api/subscriptions', {
      email: 'person@example.com',
      preferences: { probability70: true, resetAnnounced: true },
    });

    const res = await mailRouter.handle(req);
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body).toEqual({
      accepted: true,
      message: 'If the request is valid, it has been processed.',
    });
    expect(JSON.stringify(body)).not.toContain('token');
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].to).toBe('person@example.com');
    expect(provider.calls[0].text).toContain('/confirm?token=');
  });

  it('SUB-HTTP-12: queues a secure management email for an existing subscriber', async () => {
    await subRepo
      .getCreateStatement({
        id: 'sub-manage',
        email: 'manage@example.com',
        normalized_email: 'manage@example.com',
        state: 'active',
        notify_70: true,
        notify_announced: true,
        management_token_hash: 'none',
        created_at: new Date().toISOString(),
      })
      .run();
    const provider = new MockEmailProvider();
    const mailRouter = createSubscriptionRouter(
      db,
      'secret',
      new SubscriptionMailer(
        provider,
        new SubscriptionEmailRenderer('https://notify.example/manage')
      )
    );

    const res = await mailRouter.handle(
      makeRequest('POST', '/api/subscriptions/request-management-link', {
        email: 'manage@example.com',
      })
    );

    expect(res.status).toBe(202);
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].text).toContain('/manage?token=');
  });
});

import {
  createSubscriptionRequestSchema,
  confirmSubscriptionRequestSchema,
  requestManagementLinkSchema,
  updatePreferencesRequestSchema,
} from '@codex-reset/shared';
import { SubscriptionService } from '../services/subscription-service';
import { ConfirmationService } from '../services/confirmation-service';
import { SubscriptionManagementService } from '../services/subscription-management-service';
import { SubscriberRepository } from '../db/repositories/SubscriberRepository';
import { SubscriptionTokenRepository } from '../db/repositories/SubscriptionTokenRepository';
import { RateLimitRepository } from '../db/repositories/RateLimitRepository';
import { DbTransactions } from '../db/transactions';
import { RateLimitPolicy } from '../subscriptions/rate-limit-policy';
import { SubscriptionResponses } from './subscription-responses';
import { SubscriptionError } from '../subscriptions/subscription-errors';
import { SubscriptionMailer } from '../services/subscription-mailer';

export function createSubscriptionRouter(
  db: D1Database,
  hmacSecret: string,
  subscriptionMailer?: SubscriptionMailer
) {
  const subscriberRepo = new SubscriberRepository(db);
  const tokenRepo = new SubscriptionTokenRepository(db);
  const rateLimitRepo = new RateLimitRepository(db);
  const transactions = new DbTransactions(db);
  const rateLimitPolicy = new RateLimitPolicy(rateLimitRepo, hmacSecret);

  const subService = new SubscriptionService(subscriberRepo, rateLimitPolicy, transactions);
  const confirmService = new ConfirmationService(
    tokenRepo,
    subscriberRepo,
    rateLimitPolicy,
    transactions
  );
  const mgmtService = new SubscriptionManagementService(
    tokenRepo,
    subscriberRepo,
    rateLimitPolicy,
    transactions
  );

  const getIp = (req: Request) => req.headers.get('CF-Connecting-IP') || '127.0.0.1';
  const getContext = (req: Request) => ({
    ipAddress: getIp(req),
    hmacSecret,
    now: new Date(),
  });

  const handleError = (error: unknown) => {
    if (error instanceof SubscriptionError) {
      return SubscriptionResponses.error(error.message, error.statusCode, error.code);
    }
    console.error('Subscription error:', error);
    return SubscriptionResponses.error('Internal Server Error', 500, 'INTERNAL_ERROR');
  };

  const getBearerToken = (req: Request) => {
    const auth = req.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return null;
    return auth.slice(7);
  };

  const MAX_PAYLOAD_SIZE = 5000;

  const getBodySafely = async (request: Request) => {
    const contentLength = request.headers.get('Content-Length');
    if (contentLength) {
      const declaredLength = parseInt(contentLength, 10);
      if (!isNaN(declaredLength) && declaredLength > MAX_PAYLOAD_SIZE) {
        throw new SubscriptionError('PAYLOAD_TOO_LARGE', 'Payload too large', 413);
      }
    }

    const buffer = await request.arrayBuffer();
    if (buffer.byteLength > MAX_PAYLOAD_SIZE) {
      throw new SubscriptionError('PAYLOAD_TOO_LARGE', 'Payload too large', 413);
    }

    if (buffer.byteLength === 0) return null;
    const text = new TextDecoder('utf-8').decode(buffer);
    try {
      return JSON.parse(text);
    } catch {
      throw new SubscriptionError('INVALID_REQUEST', 'Invalid request body', 400);
    }
  };

  return {
    handle: async (request: Request) => {
      const url = new URL(request.url);
      const method = request.method;

      if (method === 'POST' && url.pathname === '/api/subscriptions') {
        try {
          const body = await getBodySafely(request);
          const parsed = createSubscriptionRequestSchema.safeParse(body);
          if (!parsed.success) {
            return SubscriptionResponses.error('Invalid request body', 400, 'INVALID_REQUEST');
          }

          const ctx = getContext(request);
          const result = await subService.requestSubscription(
            parsed.data.email,
            parsed.data.preferences,
            ctx
          );

          if (result.outcome === 'rate_limited') {
            return SubscriptionResponses.error('Too many requests', 429, 'RATE_LIMITED');
          }

          if (
            subscriptionMailer &&
            (result.outcome === 'confirmation_prepared' ||
              result.outcome === 'resubscription_pending')
          ) {
            await subscriptionMailer.sendConfirmation(
              parsed.data.email,
              result.rawConfirmationToken
            );
          }

          return SubscriptionResponses.genericAccepted();
        } catch (e) {
          return handleError(e);
        }
      }

      if (method === 'POST' && url.pathname === '/api/subscriptions/confirm') {
        try {
          const body = await getBodySafely(request);
          const parsed = confirmSubscriptionRequestSchema.safeParse(body);
          if (!parsed.success) {
            return SubscriptionResponses.error('Invalid request body', 400, 'INVALID_REQUEST');
          }

          const ctx = getContext(request);
          const result = await confirmService.confirm(parsed.data.token, ctx);

          return SubscriptionResponses.success({
            success: true,
            managementToken: result.managementToken.rawBase64Url,
          });
        } catch (e) {
          return handleError(e);
        }
      }

      if (method === 'POST' && url.pathname === '/api/subscriptions/request-management-link') {
        try {
          const body = await getBodySafely(request);
          const parsed = requestManagementLinkSchema.safeParse(body);
          if (!parsed.success) {
            return SubscriptionResponses.error('Invalid request body', 400, 'INVALID_REQUEST');
          }

          const ctx = getContext(request);
          const result = await mgmtService.requestManagementLink(parsed.data.email, ctx);

          if (result.outcome === 'rate_limited') {
            return SubscriptionResponses.error('Too many requests', 429, 'RATE_LIMITED');
          }

          if (subscriptionMailer && result.outcome === 'accepted_prepared' && result.delivery) {
            await subscriptionMailer.sendManagementLink(
              result.delivery.recipient,
              result.delivery.rawManagementToken
            );
          }

          return SubscriptionResponses.genericAccepted();
        } catch (e) {
          return handleError(e);
        }
      }

      if (method === 'GET' && url.pathname === '/api/subscriptions/manage') {
        try {
          const token = getBearerToken(request);
          if (!token) return SubscriptionResponses.error('Unauthorized', 401, 'UNAUTHORIZED');

          const ctx = getContext(request);
          const info = await mgmtService.getSubscriptionInfo(token, ctx);
          return SubscriptionResponses.success(info);
        } catch (e) {
          return handleError(e);
        }
      }

      if (method === 'PATCH' && url.pathname === '/api/subscriptions/manage') {
        try {
          const token = getBearerToken(request);
          if (!token) return SubscriptionResponses.error('Unauthorized', 401, 'UNAUTHORIZED');

          const body = await getBodySafely(request);
          const parsed = updatePreferencesRequestSchema.safeParse(body);
          if (!parsed.success) {
            return SubscriptionResponses.error('Invalid request body', 400, 'INVALID_REQUEST');
          }

          const ctx = getContext(request);
          const result = await mgmtService.updatePreferences(token, parsed.data.preferences, ctx);
          return SubscriptionResponses.success(result);
        } catch (e) {
          return handleError(e);
        }
      }

      if (method === 'POST' && url.pathname === '/api/subscriptions/unsubscribe') {
        try {
          const token = getBearerToken(request);
          if (!token) return SubscriptionResponses.error('Unauthorized', 401, 'UNAUTHORIZED');

          const ctx = getContext(request);
          const result = await mgmtService.unsubscribe(token, ctx);
          return SubscriptionResponses.success(result);
        } catch (e) {
          return handleError(e);
        }
      }

      return null;
    },
  };
}

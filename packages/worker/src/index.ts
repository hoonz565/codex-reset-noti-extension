import { createOrchestrationRunner } from './orchestration/factory';
import { defaultOrchestrationConfig } from './orchestration/orchestration-config';
import { handleAdminRunRequest } from './http/admin-routes';
import { ForceRunService } from './services/force-run-service';
import { SourceForecastClient } from './source/forecast-client';
import { EmailTemplateRenderer } from './email/email-template-renderer';
import { ScheduledRunService } from './services/scheduled-run-service';
import { createStatusRoutes } from './http/status-routes';
import { createStatusReadService } from './status/status-factory';
import { createMetricsRoutes } from './http/metrics-routes';
import { createMetricsReadService } from './metrics/metrics-factory';

import { createEmailProvider } from './email/providers/email-provider-factory';

export interface Env {
  ALLOWED_ORIGINS: string;
  DB: D1Database;
  RATE_LIMIT_SECRET: string;
  ADMIN_API_TOKEN?: string;
  ADMIN_SECRET?: string;
  ENVIRONMENT?: string;
  MAILGUN_API_KEY?: string;
  MAILGUN_DOMAIN?: string;
}

const handleCors = (request: Request, env: Env) => {
  const origin = request.headers.get('Origin') || '';
  const isStatus = new URL(request.url).pathname === '/api/status';

  const allowedList = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
  const isAllowedOrigin = allowedList.includes(origin);

  const allowedOrigin = isStatus ? '*' : isAllowedOrigin ? origin : '';

  return new Headers({
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  });
};

const handleOptions = (request: Request, env: Env) => {
  return new Response(null, { headers: handleCors(request, env) });
};

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (
      request.method === 'OPTIONS' &&
      !url.pathname.startsWith('/api/status') &&
      !url.pathname.startsWith('/api/admin/metrics')
    ) {
      return handleOptions(request, env);
    }

    if (url.pathname.startsWith('/api/status')) {
      const statusService = createStatusReadService(env.DB);
      const router = createStatusRoutes(statusService);
      const response = await router.fetch(request, env);
      return response as Response;
    }

    if (url.pathname.startsWith('/api/admin/metrics')) {
      const router = createMetricsRoutes(() => createMetricsReadService(env.DB));
      const response = await router.fetch(request, env);
      return response as Response;
    }

    if (url.pathname.startsWith('/api/subscriptions')) {
      const origin = request.headers.get('Origin') || '';
      const allowedList = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
      if (request.method !== 'OPTIONS' && origin && !allowedList.includes(origin)) {
        return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const { createSubscriptionRouter } = await import('./http/subscription-routes');
      const router = createSubscriptionRouter(env.DB, env.RATE_LIMIT_SECRET || 'dev-secret');

      const response = await router.handle(request);
      if (response) {
        const corsResponse = new Response(response.body, response);
        const headers = handleCors(request, env);
        headers.forEach((v, k) => corsResponse.headers.set(k, v));
        return corsResponse;
      }
    }

    if (url.pathname.startsWith('/api/admin/orchestration/run')) {
      const origin = request.headers.get('Origin') || '';
      const allowedList = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
      if (request.method !== 'OPTIONS' && origin && !allowedList.includes(origin)) {
        return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const response = await handleAdminRunRequest(request, env.ADMIN_API_TOKEN || '', () => {
        const sourceClient = new SourceForecastClient({
          url: 'https://willcodexquotareset.com/api/forecast',
        });
        const emailProvider = createEmailProvider(
          env.ENVIRONMENT || 'development',
          env.MAILGUN_API_KEY,
          env.MAILGUN_DOMAIN
        );
        const templateRenderer = new EmailTemplateRenderer('https://management-url.com');
        const runner = createOrchestrationRunner(
          env.DB,
          defaultOrchestrationConfig,
          emailProvider,
          templateRenderer,
          sourceClient
        );
        return new ForceRunService(runner);
      });
      const corsResponse = new Response(response.body, response);
      const headers = handleCors(request, env);
      headers.forEach((v, k) => corsResponse.headers.set(k, v));
      return corsResponse;
    }

    return new Response('Not found', { status: 404 });
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const sourceClient = new SourceForecastClient({
      url: 'https://willcodexquotareset.com/api/forecast',
    });
    const emailProvider = createEmailProvider(
      env.ENVIRONMENT || 'development',
      env.MAILGUN_API_KEY,
      env.MAILGUN_DOMAIN
    );
    const templateRenderer = new EmailTemplateRenderer('https://management-url.com');
    const runner = createOrchestrationRunner(
      env.DB,
      defaultOrchestrationConfig,
      emailProvider,
      templateRenderer,
      sourceClient
    );
    const scheduledService = new ScheduledRunService(runner);

    ctx.waitUntil(
      scheduledService.execute().catch((err) => {
        console.error(`Unhandled orchestration failure: Error: ${err.message || 'CRITICAL'}`);
      })
    );
  },
} satisfies ExportedHandler<Env>;

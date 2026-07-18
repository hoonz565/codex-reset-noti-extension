import { publicStatusResponseSchema } from '@codex-reset/shared';

export interface Env {
  ALLOWED_ORIGINS: string;
  DB: D1Database;
  RATE_LIMIT_SECRET: string;
  ADMIN_API_TOKEN?: string;
}

/**
 * CORS controls which browser origins may read responses.
 * CORS is not authentication and does not prevent curl, bots,
 * server-side clients, or forged direct requests.
 */
const handleCors = (request: Request, env: Env) => {
  const origin = request.headers.get('Origin') || '';
  const isStatus = new URL(request.url).pathname === '/api/status';

  const allowedList = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
  const isAllowedOrigin = allowedList.includes(origin);

  // GET /api/status is public read-only.
  // POST /api/subscriptions requires specific origin.
  const allowedOrigin = isStatus ? '*' : isAllowedOrigin ? origin : '';

  return new Headers({
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  });
};

const handleOptions = (request: Request, env: Env) => {
  return new Response(null, { headers: handleCors(request, env) });
};

const handleStatus = (request: Request, env: Env) => {
  const url = new URL(request.url);
  const isColdStart = url.searchParams.get('coldStart') === 'true';

  let responseBody;
  if (isColdStart) {
    responseBody = {
      ok: true,
      sourceHealth: 'unavailable',
      status: null,
      message: 'No successful source check has completed yet.',
    };
  } else {
    responseBody = {
      ok: true,
      sourceHealth: 'healthy',
      status: {
        schemaVersion: 1,
        probability: 73,
        lifecycle: 'none',
        resetCycleId: 'cycle:transport-spike',
        latestResetAt: null,
        announcementAt: null,
        title: 'High likelihood',
        description: 'Transport spike status response.',
        latestSignal: null,
        sourceUrl: 'https://www.willcodexquotareset.com/',
        sourceUpdatedAt: new Date().toISOString(),
        checkedAt: new Date().toISOString(),
        statusChangedAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
        sourceHealth: 'healthy',
        sourceWarnings: [],
        parserVersion: 'transport-spike',
      },
    };
  }

  // Runtime validation
  const parsed = publicStatusResponseSchema.parse(responseBody);

  const headers = handleCors(request, env);
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(parsed), { headers });
};

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return handleOptions(request, env);
    }

    if (request.method === 'GET' && url.pathname === '/api/status') {
      return handleStatus(request, env);
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
      const { createOrchestrationRunner } = await import('./orchestration/factory');
      const { defaultOrchestrationConfig } = await import('./orchestration/orchestration-config');
      const { handleAdminRunRequest } = await import('./http/admin-routes');
      const { ForceRunService } = await import('./services/force-run-service');
      const { SourceForecastClient } = await import('./source/forecast-client');
      const { MockEmailProvider } = await import('./email/providers/mock-email-provider');
      const { EmailTemplateRenderer } = await import('./email/email-template-renderer');

      // We instantiate the runner dependencies here lazily.
      const sourceClient = new SourceForecastClient({ url: 'https://willcodexquotareset.com/api/forecast' });
      const emailProvider = new MockEmailProvider();
      const templateRenderer = new EmailTemplateRenderer('https://management-url.com');
      const runner = createOrchestrationRunner(env.DB, defaultOrchestrationConfig, emailProvider, templateRenderer, sourceClient);
      const forceRunService = new ForceRunService(runner);

      const response = await handleAdminRunRequest(request, env.ADMIN_API_TOKEN || '', forceRunService);
      const corsResponse = new Response(response.body, response);
      const headers = handleCors(request, env);
      headers.forEach((v, k) => corsResponse.headers.set(k, v));
      return corsResponse;
    }

    return new Response('Not found', { status: 404 });
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const { createOrchestrationRunner } = await import('./orchestration/factory');
    const { defaultOrchestrationConfig } = await import('./orchestration/orchestration-config');
    const { ScheduledRunService } = await import('./services/scheduled-run-service');
    const { SourceForecastClient } = await import('./source/forecast-client');
    const { MockEmailProvider } = await import('./email/providers/mock-email-provider');
    const { EmailTemplateRenderer } = await import('./email/email-template-renderer');

    const sourceClient = new SourceForecastClient({ url: 'https://willcodexquotareset.com/api/forecast' });
    const emailProvider = new MockEmailProvider();
    const templateRenderer = new EmailTemplateRenderer('https://management-url.com');
    const runner = createOrchestrationRunner(env.DB, defaultOrchestrationConfig, emailProvider, templateRenderer, sourceClient);
    const scheduledService = new ScheduledRunService(runner);

    ctx.waitUntil(scheduledService.execute());
  },
} satisfies ExportedHandler<Env>;

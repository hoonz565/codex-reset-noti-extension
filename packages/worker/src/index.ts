import { publicStatusResponseSchema, createSubscriptionRequestSchema } from '@codex-reset/shared';

export interface Env {
  ALLOWED_ORIGINS: string;
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

const handleSubscriptions = async (request: Request, env: Env) => {
  const origin = request.headers.get('Origin') || '';
  const allowedList = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
  const isAllowedOrigin = allowedList.includes(origin);

  if (!isAllowedOrigin) {
    return new Response(JSON.stringify({ error: 'Forbidden origin' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const MAX_PAYLOAD_SIZE = 5000;

  // 1. Read and validate Content-Length when present.
  const contentLengthHeader = request.headers.get('Content-Length');
  if (contentLengthHeader) {
    const declaredLength = parseInt(contentLengthHeader, 10);
    // 2. Reject an oversized declared length before reading the body.
    if (!isNaN(declaredLength) && declaredLength > MAX_PAYLOAD_SIZE) {
      return new Response(JSON.stringify({ error: 'Payload too large' }), {
        status: 413,
        headers: {
          'Content-Type': 'application/json',
          ...Object.fromEntries(handleCors(request, env)),
        },
      });
    }
  }

  try {
    // 3. Read the raw body.
    // Cloudflare Workers fetch API buffers request.arrayBuffer() safely up to Worker limits
    // but we enforce our own lower limit before parsing.
    const buffer = await request.arrayBuffer();

    // 4. Measure the actual byte length.
    // 5. Reject if actual length exceeds the configured limit.
    if (buffer.byteLength > MAX_PAYLOAD_SIZE) {
      return new Response(JSON.stringify({ error: 'Payload too large' }), {
        status: 413,
        headers: {
          'Content-Type': 'application/json',
          ...Object.fromEntries(handleCors(request, env)),
        },
      });
    }

    const text = new TextDecoder('utf-8').decode(buffer);

    // 6. Parse JSON only after the size checks.
    const body = JSON.parse(text);
    // Validate request body
    createSubscriptionRequestSchema.parse(body);

    const headers = handleCors(request, env);
    headers.set('Content-Type', 'application/json');

    return new Response(
      JSON.stringify({
        ok: true,
        subscription: {
          id: 'sub_transport_spike',
          state: 'pending_confirmation',
        },
        managementToken: 'transport-spike-placeholder',
        message: 'Transport validation succeeded. NON-PRODUCTION BEHAVIOR.',
      }),
      { headers }
    );
  } catch (err: unknown) {
    const errorObj = err as Record<string, unknown>;
    const headers = handleCors(request, env);
    headers.set('Content-Type', 'application/json');

    return new Response(
      JSON.stringify({
        error: 'Validation error',
        details: errorObj?.issues || errorObj?.message || 'Unknown error',
      }),
      {
        status: 400,
        headers,
      }
    );
  }
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

    if (request.method === 'POST' && url.pathname === '/api/subscriptions') {
      return handleSubscriptions(request, env);
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;

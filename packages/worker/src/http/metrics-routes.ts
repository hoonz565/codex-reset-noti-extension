/* eslint-disable @typescript-eslint/no-explicit-any */
import { verifyAdminToken } from './admin-auth';

type MetricsServiceFactory = () => any;

export function createMetricsRoutes(factory: MetricsServiceFactory) {
  return {
    fetch: async (request: Request, env: any) => {
      const url = new URL(request.url);
      const method = request.method;

      if (url.pathname !== '/api/admin/metrics') {
        return new Response('Not found', { status: 404 });
      }

      if (method === 'OPTIONS') {
        const origin = request.headers.get('Origin');
        if (origin) {
          const allowedOrigins = (env.ALLOWED_ORIGINS || '')
            .split(',')
            .map((s: string) => s.trim());
          if (allowedOrigins.includes(origin)) {
            return new Response(null, {
              status: 204,
              headers: {
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type',
                Vary: 'Origin',
              },
            });
          } else {
            return new Response('Forbidden', { status: 403 });
          }
        }

        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          },
        });
      }

      if (method === 'GET') {
        const origin = request.headers.get('Origin');
        let corsHeaders: Record<string, string> = {};

        if (origin) {
          const allowedOrigins = (env.ALLOWED_ORIGINS || '')
            .split(',')
            .map((s: string) => s.trim());
          if (allowedOrigins.includes(origin)) {
            corsHeaders = {
              'Access-Control-Allow-Origin': origin,
              Vary: 'Origin',
            };
          } else {
            return new Response('Forbidden', { status: 403 });
          }
        }

        if (!verifyAdminToken(request as any, env.ADMIN_API_TOKEN)) {
          return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

        const windowStr = url.searchParams.get('window') || '24h';

        try {
          const now = new Date();
          const service = factory();
          const metrics = await service.getMetrics(windowStr, now);

          return new Response(JSON.stringify(metrics), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'private, no-store',
              ...corsHeaders,
            },
          });
        } catch (err: any) {
          if (err.message === 'Invalid window parameter') {
            return new Response(JSON.stringify({ error: 'BAD_REQUEST' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });
          }
          return new Response(JSON.stringify({ error: 'INTERNAL_SERVER_ERROR' }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store',
              ...corsHeaders,
            },
          });
        }
      }

      return new Response('Method Not Allowed', { status: 405 });
    },
  };
}

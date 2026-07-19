/* eslint-disable @typescript-eslint/no-explicit-any */
import { StatusReadService } from '../status/status-read-service';

export function createStatusRoutes(statusReadService: StatusReadService) {
  return {
    fetch: async (request: Request, env: any) => {
      const url = new URL(request.url);
      const method = request.method;

      if (url.pathname !== '/api/status') {
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

        try {
          const now = new Date();
          const status = await statusReadService.getPublicStatus(now);

          return new Response(
            JSON.stringify({
              schemaVersion: 1,
              status,
              generatedAt: now.toISOString(),
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
                ...corsHeaders,
              },
            }
          );
        } catch {
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

import { publicStatusResponseSchema, type SubscriberEventType } from '@codex-reset/shared';

// Dummy usage to satisfy eslint and verify imports
console.log(publicStatusResponseSchema.description);
const _type: SubscriberEventType = 'RESET_ANNOUNCED';

// Placeholder for Cloudflare Worker implementation
export default {
  async fetch(_request: Request, _env: Env, _ctx: ExecutionContext): Promise<Response> {
    return new Response('Not implemented', { status: 501 });
  },
} satisfies ExportedHandler<Env>;

interface Env {
  [key: string]: unknown;
}

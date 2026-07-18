import { GenericAcceptedResponse } from '@codex-reset/shared';

export class SubscriptionResponses {
  static genericAccepted(): Response {
    const payload: GenericAcceptedResponse = {
      accepted: true,
      message: 'If the request is valid, it has been processed.',
    };
    return new Response(JSON.stringify(payload), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  static success(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  static error(message: string, status = 400, code = 'BAD_REQUEST'): Response {
    return new Response(JSON.stringify({ error: message, code }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function unauthorized(code: string): Response {
  return new Response(JSON.stringify({ error: code }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function successResponse(payload: any): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

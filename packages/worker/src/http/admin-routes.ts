import { verifyAdminToken } from './admin-auth';
import { unauthorized, badRequest, successResponse } from './admin-responses';
import { ForceRunService } from '../services/force-run-service';

export async function handleAdminRunRequest(
  request: Request,
  envSecret: string,
  forceRunServiceFactory: () => ForceRunService
): Promise<Response> {
  // CORS preflight is handled upstream (in index.ts) for OPTIONS.
  // This route expects only POST.
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // 1. Verify Bearer token
  if (!verifyAdminToken(request, envSecret)) {
    return unauthorized('MISSING_SECRET');
  }

  // 2. Validate empty body
  const bodyText = await request.text();
  if (bodyText.length > 0) {
    return badRequest('Request body must be empty');
  }

  // 3. Execute
  const forceRunService = forceRunServiceFactory();
  const result = await forceRunService.execute();

  return successResponse(result);
}

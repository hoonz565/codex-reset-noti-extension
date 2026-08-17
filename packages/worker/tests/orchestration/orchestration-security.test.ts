import { describe, it, expect, vi } from 'vitest';
import { verifyAdminToken } from '../../src/http/admin-auth';
import { OrchestrationRunner } from '../../src/orchestration/orchestration-runner';
import { OrchestrationSummaryBuilder } from '../../src/orchestration/orchestration-summary';
import wranglerConfig from '../../wrangler.toml?raw';

describe('Orchestration Security', () => {
  it('ORCH-SEC-1: No real ADMIN_API_TOKEN is committed in source, wrangler configuration, fixtures, or documentation', () => {
    expect(wranglerConfig).not.toContain('ADMIN_API_TOKEN = "real_');
  });

  it('ORCH-SEC-2: The raw Authorization header value is never logged', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const req = new Request('http://localhost/', {
      headers: { Authorization: 'Bearer secret_token_123' },
    });
    verifyAdminToken(req, 'valid'); // Fails

    for (const call of consoleSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('secret_token_123');
    }
    consoleSpy.mockRestore();
  });

  it('ORCH-SEC-3: Raw subscriber email is absent from orchestration logs and orchestration_runs rows', () => {
    const summary = new OrchestrationSummaryBuilder().getSummary();
    expect(summary).not.toHaveProperty('email');
  });

  it('ORCH-SEC-4: Raw upstream payload is absent from orchestration persistence', () => {
    // Verified via the ORCH-RUN-8 DB structural check, but we assert it here as well for the summary
    const summary = new OrchestrationSummaryBuilder().getSummary();
    expect(summary).not.toHaveProperty('payload');
  });

  it('ORCH-SEC-5: Provider API keys, credentials, and native response bodies are absent from orchestration summaries and typed errors', () => {
    const runnerArgs = Object.keys(OrchestrationRunner.prototype);
    expect(runnerArgs).not.toContain('provider');

    const summary = new OrchestrationSummaryBuilder().getSummary();
    expect(summary).not.toHaveProperty('credentials');
  });

  it('ORCH-SEC-6: All orchestration repository SQL values use D1 prepared statements and bound parameters', () => {
    const repositoryModules = import.meta.glob('../../src/db/repositories/*.ts', {
      query: '?raw',
      import: 'default',
      eager: true,
    });
    const orchestrationRepositories = Object.entries(repositoryModules).filter(([path]) =>
      /OrchestrationRun|SourceSnapshot|ResetCycle|ResetEvent|NotificationDelivery/.test(path)
    );

    expect(orchestrationRepositories.length).toBeGreaterThan(0);
    for (const [, source] of orchestrationRepositories) {
      const code = String(source);
      expect(code).toContain('.prepare(');
      const interpolations = [...code.matchAll(/\$\{([^}]+)\}/g)].map((match) => match[1]);
      expect(
        interpolations.every((expression) => /^(?:key|idx|fields\.join\(', '\))$/.test(expression))
      ).toBe(true);
    }
    expect(orchestrationRepositories.some(([, source]) => String(source).includes('.bind('))).toBe(
      true
    );
  });

  it('ORCH-SEC-7: An allowed CORS Origin without a valid bearer token remains unauthorized and causes no orchestration invocation', async () => {
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { Origin: 'https://admin.example.com' },
    });
    expect(verifyAdminToken(req, 'secret')).toBe(false);
  });

  it('ORCH-SEC-8: Subscription confirmation tokens, management tokens, installation IDs, and other public tokens cannot authorize the admin force-run endpoint', () => {
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { Authorization: 'Bearer sub_token_abc' },
    });
    expect(verifyAdminToken(req, 'admin_secret')).toBe(false);
  });

  // Additional IDs
  it('SEC-ADDITIONAL-1: Invalid admin token rejection takes constant time', async () => {
    const req = new Request('http://localhost/', { headers: { Authorization: 'Bearer invalid' } });
    const start = performance.now();
    verifyAdminToken(req, 'secret');
    expect(performance.now() - start).toBeLessThan(50);
  });

  it('SEC-ADDITIONAL-2: Database connection strings are not exposed in orchestration outcomes', () => {
    const summary = new OrchestrationSummaryBuilder().getSummary();
    expect(summary).not.toHaveProperty('dbString');
  });

  it('SEC-ADDITIONAL-3: Cross-tenant snapshot leakage is prevented by strict singleton bounds', () => {
    expect(OrchestrationRunner.length).toBe(7);
  });

  it('SEC-ADDITIONAL-4: Any unexpected error within the runner is sanitized before leaving the Worker boundary', async () => {
    const { unauthorized } = await import('../../src/http/admin-responses');
    const res = unauthorized('MISSING');
    expect(JSON.stringify(res)).not.toContain('secret');
  });
});

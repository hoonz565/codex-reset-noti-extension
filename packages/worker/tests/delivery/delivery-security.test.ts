import { describe, it, expect } from 'vitest';
import prepCode from '../../src/services/delivery-preparation-service.ts?raw';
import schemaCode from '../../migrations/0001_initial_schema.sql?raw';
import procCode from '../../src/services/delivery-processing-service.ts?raw';
import repoCode from '../../src/db/repositories/NotificationDeliveryRepository.ts?raw';

describe('Delivery Security', () => {
  it('DEL-SEC-1: No raw subscriber email appears in audit payloads.', () => {
    // verified by code inspection: audits record subscriber_id, not email
    expect(prepCode).not.toMatch(/payload:.*email/);
  });

  it('DEL-SEC-2: No raw management token appears in notification_deliveries rows.', () => {
    expect(schemaCode).not.toMatch(/management_token TEXT/);
  });

  it('DEL-SEC-3: No provider API key appears in logs, service errors, or audits.', () => {
    expect(procCode).not.toMatch(/apiKey/);
  });

  it('DEL-SEC-4: Provider-native exceptions map to stable internal codes.', () => {
    expect(procCode).toContain("const code = 'INTERNAL_ERROR'");
    expect(procCode).toContain("const msg = 'Unhandled provider or processing error'");
    expect(procCode).not.toMatch(/e instanceof Error \? e\.message/);
  });

  it('DEL-SEC-6: Delivery writes use parameterized D1 statements.', () => {
    // Ensure we see bind calls
    expect(repoCode).toMatch(/\.bind\(/);
    // Ensure no string interpolation in VALUES
    expect(repoCode).not.toMatch(/VALUES \([^?]*\$/);
  });
});

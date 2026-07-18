import { describe, test, expect } from 'vitest';
import {
  mapSubscriberRow,
  mapSourceSnapshotRow,
  mapAuditEventRow,
  mapResetCycleRow,
  SubscriberRow,
  SourceSnapshotRow,
  AuditEventRow,
  ResetCycleRow,
} from '../../src/db';

describe('Database Row Mappers', () => {
  test('DB-MAP-1: INTEGER booleans map correctly', () => {
    const row: SubscriberRow = {
      id: '1',
      email: 'a@b.com',
      normalized_email: 'a@b.com',
      state: 'active',
      notify_70: 1,
      notify_announced: 0,
      management_token_hash: 'hash',
      token_version: 1,
      created_at: '',
      updated_at: '',
      confirmation_token_hash: null,
      confirmation_expires_at: null,
      confirmed_at: null,
      unsubscribed_at: null,
    };

    const mapped = mapSubscriberRow(row);
    expect(mapped.notify_70).toBe(true);
    expect(mapped.notify_announced).toBe(false);
  });

  test('DB-MAP-2: Invalid enum value in a raw row is rejected', () => {
    const row: SourceSnapshotRow = {
      id: '1',
      reset_cycle_id: 'c',
      probability: 70,
      lifecycle: 'invalid_lifecycle_here',
      source_health: 'healthy',
      source_updated_at: '',
      checked_at: '',
      payload_hash: '',
      meaningful_change: 1,
      created_at: '',
    };

    expect(() => mapSourceSnapshotRow(row)).toThrow(/Invalid lifecycle/);
  });

  test('DB-MAP-3: Malformed payload_json is rejected safely', () => {
    const row: AuditEventRow = {
      id: '1',
      type: 'RESET_COMPLETED',
      deduplication_key: null,
      subject_type: null,
      subject_id: null,
      payload_json: '{ bad_json }',
      created_at: '',
    };

    expect(() => mapAuditEventRow(row)).toThrow(/Malformed payload_json/);
  });

  test('DB-MAP-4: Null handling matches shared contracts', () => {
    const row: AuditEventRow = {
      id: '1',
      type: 'RESET_COMPLETED',
      deduplication_key: null,
      subject_type: null,
      subject_id: null,
      payload_json: null, // Valid null
      created_at: '',
    };

    const mapped = mapAuditEventRow(row);
    expect(mapped.payload).toBeNull();
  });

  test('DB-MAP-5: A raw updated_at value containing timestamp#UUID is rejected', () => {
    const row: ResetCycleRow = {
      id: 'cycle:test',
      anchor_reset_at: null,
      state: 'completed',
      announcement_at: null,
      completed_at: '2026-07-18T00:00:00.000Z',
      transition_token: 'some-uuid',
      created_at: '2026-07-18T00:00:00.000Z',
      // Malformed: has the legacy timestamp#UUID format
      updated_at: '2026-07-18T00:00:00.000Z#a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    };

    expect(() => mapResetCycleRow(row)).toThrow(/Invalid updated_at timestamp/);
  });
});

import { env } from 'cloudflare:test';

export async function setupTestDb() {
  const db = env.DB as D1Database;
  // Clean up any existing tables (since the DB might be reused within the worker pool thread)
  await db.exec(`
    DROP TABLE IF EXISTS audit_events;
    DROP TABLE IF EXISTS rate_limit_records;
    DROP TABLE IF EXISTS notification_deliveries;
    DROP TABLE IF EXISTS reset_events;
    DROP TABLE IF EXISTS source_snapshots;
    DROP TABLE IF EXISTS reset_cycles;
    DROP TABLE IF EXISTS subscribers;
    DROP TABLE IF EXISTS d1_migrations;
  `);

  // We can't import node:fs easily in worker tests due to the runtime.
  // However, `vitest-pool-workers` runs tests inside the worker runtime.
  // Since we want to test migrations, we can either use applyD1Migrations if we had the binding,
  // or since this is a unit test, we can just supply the DDL string.
  const statements = SCHEMA_SQL.split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => db.prepare(s));

  await db.batch(statements);
  return db;
}

export const SCHEMA_SQL = `
CREATE TABLE subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  normalized_email TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL,
  notify_70 INTEGER NOT NULL DEFAULT 1 CHECK (notify_70 IN (0, 1)),
  notify_announced INTEGER NOT NULL DEFAULT 1 CHECK (notify_announced IN (0, 1)),
  confirmation_token_hash TEXT,
  confirmation_expires_at TEXT,
  management_token_hash TEXT NOT NULL,
  token_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  updated_at TEXT NOT NULL,
  unsubscribed_at TEXT,
  CHECK (state IN ('pending_confirmation', 'active', 'unsubscribed', 'expired_confirmation'))
);
CREATE INDEX idx_subscribers_state ON subscribers(state);

CREATE TABLE reset_cycles (
  id TEXT PRIMARY KEY,
  anchor_reset_at TEXT,
  state TEXT NOT NULL,
  announcement_at TEXT,
  completed_at TEXT,
  transition_token TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (state IN ('active', 'completed', 'superseded'))
);
CREATE UNIQUE INDEX idx_reset_cycles_one_active ON reset_cycles(state) WHERE state = 'active';

CREATE TABLE source_snapshots (
  id TEXT PRIMARY KEY,
  reset_cycle_id TEXT,
  probability REAL,
  lifecycle TEXT NOT NULL,
  source_health TEXT NOT NULL,
  source_updated_at TEXT,
  checked_at TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  meaningful_change INTEGER NOT NULL DEFAULT 0 CHECK (meaningful_change IN (0, 1)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (reset_cycle_id) REFERENCES reset_cycles(id) ON DELETE SET NULL,
  CHECK (lifecycle IN ('none', 'announced', 'completed')),
  CHECK (source_health IN ('healthy', 'degraded', 'unavailable')),
  CHECK (probability IS NULL OR (probability >= 0 AND probability <= 100)),
  CHECK (probability IS NOT NULL OR source_health = 'unavailable')
);
CREATE INDEX idx_snapshots_meaningful ON source_snapshots(meaningful_change) WHERE meaningful_change = 1;
CREATE INDEX idx_snapshots_cycle ON source_snapshots(reset_cycle_id);

CREATE TABLE reset_events (
  id TEXT PRIMARY KEY,
  reset_cycle_id TEXT NOT NULL,
  type TEXT NOT NULL,
  threshold INTEGER,
  previous_probability REAL,
  current_probability REAL,
  source_signal_id TEXT,
  source_snapshot_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (reset_cycle_id) REFERENCES reset_cycles(id) ON DELETE CASCADE,
  FOREIGN KEY (source_snapshot_id) REFERENCES source_snapshots(id) ON DELETE RESTRICT,
  CHECK (type IN ('PROBABILITY_REACHED_70', 'RESET_ANNOUNCED')),
  CHECK (type != 'PROBABILITY_REACHED_70' OR threshold = 70),
  UNIQUE(reset_cycle_id, type)
);
CREATE INDEX idx_reset_events_cycle ON reset_events(reset_cycle_id);

CREATE TABLE notification_deliveries (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  state TEXT NOT NULL,
  provider_message_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES reset_events(id) ON DELETE CASCADE,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE,
  CHECK (channel = 'email'),
  CHECK (state IN ('pending', 'processing', 'sent_to_provider', 'failed_retryable', 'failed_permanent', 'cancelled')),
  UNIQUE(event_id, subscriber_id, channel)
);
CREATE INDEX idx_deliveries_pending ON notification_deliveries(state, next_attempt_at) WHERE state IN ('pending', 'failed_retryable');
CREATE INDEX idx_deliveries_subscriber ON notification_deliveries(subscriber_id);

CREATE TABLE rate_limit_records (
  key TEXT PRIMARY KEY,
  action_type TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_rate_limit_expires ON rate_limit_records(expires_at);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  deduplication_key TEXT UNIQUE,
  subject_type TEXT,
  subject_id TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_type ON audit_events(type);
CREATE INDEX idx_audit_subject ON audit_events(subject_type, subject_id);
`;

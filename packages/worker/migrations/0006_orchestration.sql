-- Up Migration
CREATE TABLE orchestration_runs (
  id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('scheduled', 'admin')),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'completed_with_errors', 'skipped_overlap', 'failed')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  source_outcome TEXT CHECK (source_outcome IN ('fresh_snapshot_persisted', 'unchanged_snapshot_persisted', 'unavailable_snapshot_persisted', 'source_request_failed', 'source_validation_failed') OR source_outcome IS NULL),
  snapshot_id TEXT REFERENCES source_snapshots(id) ON DELETE SET NULL,
  events_created INTEGER NOT NULL DEFAULT 0 CHECK (events_created >= 0),
  deliveries_prepared INTEGER NOT NULL DEFAULT 0 CHECK (deliveries_prepared >= 0),
  deliveries_sent INTEGER NOT NULL DEFAULT 0 CHECK (deliveries_sent >= 0),
  deliveries_retried INTEGER NOT NULL DEFAULT 0 CHECK (deliveries_retried >= 0),
  deliveries_failed INTEGER NOT NULL DEFAULT 0 CHECK (deliveries_failed >= 0),
  deliveries_cancelled INTEGER NOT NULL DEFAULT 0 CHECK (deliveries_cancelled >= 0),
  stale_deliveries_recovered INTEGER NOT NULL DEFAULT 0 CHECK (stale_deliveries_recovered >= 0),
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_orch_runs_status ON orchestration_runs(status);

CREATE TABLE orchestration_locks (
  name TEXT PRIMARY KEY,
  owner_run_id TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

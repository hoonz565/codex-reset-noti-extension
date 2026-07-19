-- Migration 0007: Dashboard Metrics

CREATE INDEX idx_orch_runs_started_status ON orchestration_runs(started_at, status);
CREATE INDEX idx_reset_events_type_created ON reset_events(type, created_at);
CREATE INDEX idx_deliveries_processing_started ON notification_deliveries(state, processing_started_at) WHERE state = 'processing';

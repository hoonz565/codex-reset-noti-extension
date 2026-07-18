-- Migration 0005: Delivery State Correction

-- Create new table without failed_retryable
CREATE TABLE notification_deliveries_new (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  state TEXT NOT NULL,
  provider_message_id TEXT,
  processing_token TEXT,
  processing_started_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES reset_events(id) ON DELETE CASCADE,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE,
  CHECK (channel = 'email'),
  CHECK (state IN ('pending', 'processing', 'sent_to_provider', 'failed_permanent', 'cancelled')),
  UNIQUE(event_id, subscriber_id, channel)
);

-- Copy data, mapping failed_retryable to pending
INSERT INTO notification_deliveries_new (
  id, event_id, subscriber_id, channel, state, provider_message_id, processing_token, processing_started_at, attempt_count, next_attempt_at, last_error_code, last_error_message, created_at, updated_at
)
SELECT 
  id, event_id, subscriber_id, channel, 
  CASE WHEN state = 'failed_retryable' THEN 'pending' ELSE state END, 
  provider_message_id, processing_token, processing_started_at, attempt_count, next_attempt_at, last_error_code, last_error_message, created_at, updated_at
FROM notification_deliveries;

-- Drop old table
DROP TABLE notification_deliveries;

-- Rename new table
ALTER TABLE notification_deliveries_new RENAME TO notification_deliveries;

-- Recreate indexes
CREATE INDEX idx_deliveries_pending ON notification_deliveries(state, next_attempt_at) WHERE state = 'pending';
CREATE INDEX idx_deliveries_subscriber ON notification_deliveries(subscriber_id);

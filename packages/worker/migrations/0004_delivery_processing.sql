-- Migration 0004: Delivery Processing

ALTER TABLE notification_deliveries ADD COLUMN processing_token TEXT;
ALTER TABLE notification_deliveries ADD COLUMN processing_started_at TEXT;

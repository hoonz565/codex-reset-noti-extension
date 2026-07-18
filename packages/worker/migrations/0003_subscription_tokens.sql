-- Migration 0003_subscription_tokens.sql

CREATE TABLE subscription_tokens (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('confirm_subscription', 'manage_subscription')),
  token_hash TEXT NOT NULL UNIQUE,
  requested_probability70 INTEGER,
  requested_reset_announced INTEGER,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id)
);

CREATE INDEX idx_subscription_tokens_lookup ON subscription_tokens(subscriber_id, purpose);
CREATE INDEX idx_subscription_tokens_hash ON subscription_tokens(token_hash);

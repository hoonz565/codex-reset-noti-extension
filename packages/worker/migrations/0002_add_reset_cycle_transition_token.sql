-- Migration 0002_add_reset_cycle_transition_token.sql

ALTER TABLE reset_cycles ADD COLUMN transition_token TEXT;

import {
  ResetLifecycle,
  SourceHealth,
  SubscriberEventType,
  OperationalEventType,
  DeliveryState,
  DeliveryChannel,
} from '@codex-reset/shared';

// ============================================================================
// D1 ROW MODELS
// ============================================================================

export interface SubscriberRow {
  id: string;
  email: string;
  normalized_email: string;
  state: string; // 'pending_confirmation' | 'active' | 'unsubscribed' | 'expired_confirmation'
  notify_70: number; // 0 or 1
  notify_announced: number; // 0 or 1
  confirmation_token_hash: string | null;
  confirmation_expires_at: string | null;
  management_token_hash: string;
  token_version: number;
  created_at: string;
  confirmed_at: string | null;
  updated_at: string;
  unsubscribed_at: string | null;
}

export interface ResetCycleRow {
  id: string;
  anchor_reset_at: string | null;
  state: string; // 'active' | 'completed' | 'superseded'
  announcement_at: string | null;
  completed_at: string | null;
  transition_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceSnapshotRow {
  id: string;
  reset_cycle_id: string | null;
  probability: number | null;
  lifecycle: string; // ResetLifecycle
  source_health: string; // SourceHealth
  source_updated_at: string | null;
  checked_at: string;
  payload_hash: string;
  meaningful_change: number; // 0 or 1
  created_at: string;
}

export interface ResetEventRow {
  id: string;
  reset_cycle_id: string;
  type: string; // SubscriberEventType
  threshold: number | null;
  previous_probability: number | null;
  current_probability: number | null;
  source_signal_id: string | null;
  source_snapshot_id: string;
  created_at: string;
}

export interface NotificationDeliveryRow {
  id: string;
  event_id: string;
  subscriber_id: string;
  channel: string; // DeliveryChannel
  state: string; // DeliveryState
  provider_message_id: string | null;
  attempt_count: number;
  next_attempt_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  processing_token: string | null;
  processing_started_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RateLimitRecordRow {
  key: string;
  action_type: string;
  count: number;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionTokenRow {
  id: string;
  subscriber_id: string;
  purpose: string; // 'confirm_subscription' | 'manage_subscription'
  token_hash: string;
  requested_probability70: number | null; // 0 or 1
  requested_reset_announced: number | null; // 0 or 1
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
}

export interface AuditEventRow {
  id: string;
  type: string; // OperationalEventType
  deduplication_key: string | null;
  subject_type: string | null;
  subject_id: string | null;
  payload_json: string | null;
  created_at: string;
}

// ============================================================================
// MAPPERS
// ============================================================================

export function mapSubscriberRow(row: SubscriberRow) {
  const allowedStates = ['pending_confirmation', 'active', 'unsubscribed', 'expired_confirmation'];
  if (!allowedStates.includes(row.state)) {
    throw new Error(`Invalid subscriber state in DB: ${row.state}`);
  }
  // Domain mapper translation
  const domainState =
    row.state === 'pending_confirmation'
      ? 'pending'
      : row.state === 'expired_confirmation'
        ? 'suppressed'
        : row.state;

  return {
    ...row,
    state: domainState as 'pending' | 'active' | 'unsubscribed' | 'suppressed',
    notify_70: row.notify_70 === 1,
    notify_announced: row.notify_announced === 1,
    preferences: {
      probability70: row.notify_70 === 1,
      resetAnnounced: row.notify_announced === 1,
    },
  };
}

export type Subscriber = ReturnType<typeof mapSubscriberRow>;

export function mapSubscriptionTokenRow(row: SubscriptionTokenRow) {
  if (row.purpose !== 'confirm_subscription' && row.purpose !== 'manage_subscription') {
    throw new Error(`Invalid subscription token purpose: ${row.purpose}`);
  }
  return {
    ...row,
    purpose: row.purpose as 'confirm_subscription' | 'manage_subscription',
    requested_probability70:
      row.requested_probability70 === null ? null : row.requested_probability70 === 1,
    requested_reset_announced:
      row.requested_reset_announced === null ? null : row.requested_reset_announced === 1,
  };
}

export function mapResetCycleRow(row: ResetCycleRow) {
  if (row.updated_at.includes('#')) {
    throw new Error(`Invalid updated_at timestamp in DB: ${row.updated_at}`);
  }
  return row;
}

export function mapSourceSnapshotRow(row: SourceSnapshotRow) {
  const allowedLifecycles: ResetLifecycle[] = ['none', 'announced', 'completed'];
  const allowedHealths: SourceHealth[] = ['healthy', 'degraded', 'unavailable'];

  if (!allowedLifecycles.includes(row.lifecycle as ResetLifecycle)) {
    throw new Error(`Invalid lifecycle in DB: ${row.lifecycle}`);
  }
  if (!allowedHealths.includes(row.source_health as SourceHealth)) {
    throw new Error(`Invalid source_health in DB: ${row.source_health}`);
  }

  return {
    ...row,
    lifecycle: row.lifecycle as ResetLifecycle,
    source_health: row.source_health as SourceHealth,
    meaningful_change: row.meaningful_change === 1,
  };
}

export function mapResetEventRow(row: ResetEventRow) {
  const allowedTypes: SubscriberEventType[] = ['PROBABILITY_REACHED_70', 'RESET_ANNOUNCED'];
  if (!allowedTypes.includes(row.type as SubscriberEventType)) {
    throw new Error(`Invalid reset_event type in DB: ${row.type}`);
  }
  return {
    ...row,
    type: row.type as SubscriberEventType,
  };
}

export function mapNotificationDeliveryRow(row: NotificationDeliveryRow) {
  const allowedStates: DeliveryState[] = [
    'pending',
    'processing',
    'sent_to_provider',
    'failed_permanent',
    'cancelled',
  ];
  if (!allowedStates.includes(row.state as DeliveryState)) {
    throw new Error(`Invalid delivery state in DB: ${row.state}`);
  }
  return {
    ...row,
    state: row.state as DeliveryState,
    channel: row.channel as DeliveryChannel,
  };
}

export function mapAuditEventRow(row: AuditEventRow) {
  let parsedPayload: Record<string, unknown> | null = null;
  if (row.payload_json) {
    try {
      parsedPayload = JSON.parse(row.payload_json);
    } catch {
      throw new Error(`Malformed payload_json in audit event: ${row.id}`);
    }
  }

  return {
    ...row,
    type: row.type as OperationalEventType,
    payload: parsedPayload,
  };
}

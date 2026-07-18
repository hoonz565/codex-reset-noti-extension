export type DeliveryState =
  'pending' | 'processing' | 'sent_to_provider' | 'failed_permanent' | 'cancelled';

export interface DeliveryPreparationResult {
  outcome: 'prepared' | 'event_not_found' | 'unsupported_event' | 'failed';
  eventId?: string;
  created?: number;
  alreadyExisting?: number;
  ineligible?: number;
  eventType?: string;
  error?: Error;
}

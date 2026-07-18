export type DeliveryState =
  | 'pending'
  | 'processing'
  | 'sent_to_provider'
  | 'failed_retryable'
  | 'failed_permanent'
  | 'cancelled';

export type DeliveryChannel = 'email' | 'whatsapp' | 'telegram' | 'browser';

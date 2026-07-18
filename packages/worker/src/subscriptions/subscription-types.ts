export type SubscriptionState = 'pending' | 'active' | 'unsubscribed' | 'suppressed';

export type TokenPurpose = 'confirm_subscription' | 'manage_subscription';

export interface SubscriptionContext {
  ipAddress: string;
  hmacSecret: string;
  now: Date;
}

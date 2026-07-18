import { Subscriber } from '../db/schema';
import { SubscriberEventType } from '@codex-reset/shared';

export function isSubscriberEligibleForEvent(
  subscriber: Subscriber,
  eventType: SubscriberEventType
): boolean {
  if (subscriber.state !== 'active') {
    return false;
  }

  if (eventType === 'PROBABILITY_REACHED_70') {
    return subscriber.preferences.probability70 === true;
  }

  if (eventType === 'RESET_ANNOUNCED') {
    return subscriber.preferences.resetAnnounced === true;
  }

  return false;
}

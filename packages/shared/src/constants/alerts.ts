import { SubscriberEventType } from '../domain/events';

export const SUBSCRIBER_EVENTS: Record<SubscriberEventType, string> = {
  PROBABILITY_REACHED_70: 'Probability reached 70%',
  RESET_ANNOUNCED: 'Reset announced',
};

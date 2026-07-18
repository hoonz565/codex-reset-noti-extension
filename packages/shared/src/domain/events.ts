export type SubscriberEventType = 'PROBABILITY_REACHED_70' | 'RESET_ANNOUNCED';

export type OperationalEventType =
  | 'RESET_COMPLETED'
  | 'SOURCE_DEGRADED'
  | 'SOURCE_RECOVERED'
  | 'SOURCE_UNAVAILABLE'
  | 'PARSER_FAILURE'
  | 'CYCLE_CREATED'
  | 'BOOTSTRAP_COMPLETE'
  | 'EVENT_CANDIDATES_SUPPRESSED';

export interface ProbabilityReached70Payload {
  threshold: 70;
  previousProbability: number;
  currentProbability: number;
}

export type TriggerType = 'scheduled' | 'admin';

export type OrchestrationOutcome =
  | 'completed'
  | 'completed_with_errors'
  | 'skipped_overlap'
  | 'failed';

export type OrchestrationRunResult =
  | {
      outcome: 'completed';
      runId: string;
      summary: OrchestrationSummary;
    }
  | {
      outcome: 'completed_with_errors';
      runId: string;
      summary: OrchestrationSummary;
      errorCodes: string[];
    }
  | {
      outcome: 'skipped_overlap';
      runId: string;
    }
  | {
      outcome: 'failed';
      runId: string;
      error: Error;
      summary: OrchestrationSummary;
    };

export interface OrchestrationSummary {
  runId: string;
  triggerType: TriggerType;
  startedAt: string;
  finishedAt: string | null;
  sourceOutcome: string | null;
  snapshotId: string | null;
  eventsCreated: number;
  deliveriesPrepared: number;
  deliveriesSent: number;
  deliveriesRetried: number;
  deliveriesFailed: number;
  deliveriesCancelled: number;
  staleDeliveriesRecovered: number;
  errorCode: string | null;
}

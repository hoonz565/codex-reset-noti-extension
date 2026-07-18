import { OrchestrationSummary, TriggerType } from './orchestration-types';

export class OrchestrationSummaryBuilder {
  private summary: OrchestrationSummary;

  constructor(runId: string, triggerType: TriggerType, startedAt: string) {
    this.summary = {
      runId,
      triggerType,
      startedAt,
      finishedAt: null,
      sourceOutcome: null,
      snapshotId: null,
      eventsCreated: 0,
      deliveriesPrepared: 0,
      deliveriesSent: 0,
      deliveriesRetried: 0,
      deliveriesFailed: 0,
      deliveriesCancelled: 0,
      staleDeliveriesRecovered: 0,
      errorCode: null,
    };
  }

  setSourceOutcome(outcome: string | null, snapshotId: string | null) {
    this.summary.sourceOutcome = outcome;
    this.summary.snapshotId = snapshotId;
  }

  addEventCreated() {
    this.summary.eventsCreated++;
  }

  addDeliveriesPrepared(count: number) {
    this.summary.deliveriesPrepared += count;
  }

  addDeliveriesSent(count: number) {
    this.summary.deliveriesSent += count;
  }

  addDeliveriesRetried(count: number) {
    this.summary.deliveriesRetried += count;
  }

  addDeliveriesFailed(count: number) {
    this.summary.deliveriesFailed += count;
  }

  addDeliveriesCancelled(count: number) {
    this.summary.deliveriesCancelled += count;
  }

  addRecovered(count: number) {
    this.summary.staleDeliveriesRecovered += count;
  }

  setFinished(errorCode: string | null, finishedAt: string) {
    this.summary.errorCode = errorCode;
    this.summary.finishedAt = finishedAt;
  }

  getSummary(): OrchestrationSummary {
    return { ...this.summary };
  }
}

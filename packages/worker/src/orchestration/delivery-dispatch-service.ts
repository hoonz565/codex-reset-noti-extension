/* eslint-disable @typescript-eslint/no-unused-vars */
import { DeliveryProcessingService } from '../services/delivery-processing-service';
import { DeliveryRecoveryService } from '../services/delivery-recovery-service';
import { OrchestrationBudget } from './orchestration-budget';
import { OrchestrationConfig } from './orchestration-config';
import { OrchestrationSummaryBuilder } from './orchestration-summary';

export class DeliveryDispatchService {
  constructor(
    private processingService: DeliveryProcessingService,
    private recoveryService: DeliveryRecoveryService,
    private config: OrchestrationConfig
  ) {}

  async dispatch(
    budget: OrchestrationBudget,
    summary: OrchestrationSummaryBuilder,
    now: Date
  ): Promise<void> {
    const dispatchStartMs = budget.elapsedMs + Date.now() - Date.now(); // Just a logical marker, but budget relies on Date.now(). Let's pass the raw Date.now() to budget
    const dispatchStartRaw = Date.now();

    // 1. Recover stale deliveries
    try {
      const recovered = await this.recoveryService.recoverStaleClaims(
        this.config.processingLeaseDurationMs
      );
      summary.addRecovered(recovered.recoveredCount);
    } catch (e) {
      // Unrelated DB error during recovery? We can log or fail. We will let it bubble up if it throws.
      throw new Error('Critical DB failure during delivery recovery: ' + (e as Error).message);
    }

    // 2. Dispatch bounded loop
    let dispatchedCount = 0;

    while (
      dispatchedCount < this.config.maxDeliveriesPerRun &&
      budget.hasDispatchTimeLeft(dispatchStartRaw)
    ) {
      // Pick next delivery and process
      const processRes = await this.processingService.processNextDueDelivery();

      if (processRes.outcome === 'none_due') {
        break; // No due work
      }

      if (processRes.outcome === 'sent') {
        summary.addDeliveriesSent(1);
      } else if (processRes.outcome === 'retry_scheduled') {
        summary.addDeliveriesRetried(1);
      } else if (
        processRes.outcome === 'failed_permanent_max_attempts' ||
        processRes.outcome === 'failed_permanent' // just in case
      ) {
        summary.addDeliveriesFailed(1);
      } else if (processRes.outcome.startsWith('cancelled_')) {
        summary.addDeliveriesCancelled(1);
      } else if (processRes.outcome.startsWith('fatal_')) {
        // internal DB error during process
        throw new Error('Critical DB failure during delivery processing: ' + processRes.outcome);
      } else if (processRes.outcome === 'failed_internal_retry') {
        // Failed internally but scheduled a retry
        summary.addDeliveriesRetried(1);
      }

      dispatchedCount++;
    }
  }
}

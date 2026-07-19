/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeliveryDispatchService } from '../../src/orchestration/delivery-dispatch-service';
import { OrchestrationConfig } from '../../src/orchestration/orchestration-config';
import { OrchestrationSummaryBuilder } from '../../src/orchestration/orchestration-summary';

describe('DeliveryDispatchService', () => {
  let dispatchService: DeliveryDispatchService;
  let mockProcessingService: any;
  let mockRecoveryService: any;
  let summaryBuilder: OrchestrationSummaryBuilder;
  const config: OrchestrationConfig = {
    totalRunBudgetMs: 25000,
    deliveryDispatchBudgetMs: 15000,
    safetyMarginMs: 500,
    leaseDurationMs: 60000,
    maxDeliveriesPerRun: 25,
    processingLeaseDurationMs: 60000,
  };

  let budget: any;

  beforeEach(() => {
    mockProcessingService = { processNextDueDelivery: vi.fn() };
    mockRecoveryService = { recoverStaleClaims: vi.fn().mockResolvedValue({ recoveredCount: 0 }) };
    dispatchService = new DeliveryDispatchService(
      mockProcessingService,
      mockRecoveryService,
      config
    );
    summaryBuilder = new OrchestrationSummaryBuilder();
    budget = { elapsedMs: 10, hasDispatchTimeLeft: vi.fn().mockReturnValue(true) };
  });

  it('ORCH-DISPATCH-1: Due pending deliveries are processed', async () => {
    mockProcessingService.processNextDueDelivery
      .mockResolvedValueOnce({ outcome: 'sent' })
      .mockResolvedValueOnce({ outcome: 'none_due' });
    await dispatchService.dispatch(budget, summaryBuilder, new Date());
    expect(mockProcessingService.processNextDueDelivery).toHaveBeenCalledTimes(2);
    expect(summaryBuilder.getSummary().deliveriesSent).toBe(1);
  });

  it('ORCH-DISPATCH-2: Loop stops when no due work remains', async () => {
    mockProcessingService.processNextDueDelivery.mockResolvedValue({ outcome: 'none_due' });
    await dispatchService.dispatch(budget, summaryBuilder, new Date());
    expect(mockProcessingService.processNextDueDelivery).toHaveBeenCalledTimes(1);
  });

  it('ORCH-DISPATCH-3: Loop stops at MAX_DELIVERIES_PER_RUN', async () => {
    mockProcessingService.processNextDueDelivery.mockResolvedValue({ outcome: 'sent' });
    const localConfig = { ...config, maxDeliveriesPerRun: 5 };
    const svc = new DeliveryDispatchService(
      mockProcessingService,
      mockRecoveryService,
      localConfig
    );
    await svc.dispatch(budget, summaryBuilder, new Date());
    expect(mockProcessingService.processNextDueDelivery).toHaveBeenCalledTimes(5);
  });

  it('ORCH-DISPATCH-4: Loop stops when orchestration/dispatch budget is nearly exhausted', async () => {
    mockProcessingService.processNextDueDelivery.mockResolvedValue({ outcome: 'sent' });
    budget.hasDispatchTimeLeft.mockReturnValue(false);
    await dispatchService.dispatch(budget, summaryBuilder, new Date());
    // Since budget is exceeded on first check, it should stop after recovering claims and before loop
    expect(mockProcessingService.processNextDueDelivery).not.toHaveBeenCalled();
  });

  it('ORCH-DISPATCH-5: retry_scheduled count is separate from sent_to_provider count', async () => {
    mockProcessingService.processNextDueDelivery
      .mockResolvedValueOnce({ outcome: 'sent' })
      .mockResolvedValueOnce({ outcome: 'retry_scheduled' })
      .mockResolvedValueOnce({ outcome: 'none_due' });
    await dispatchService.dispatch(budget, summaryBuilder, new Date());
    const sum = summaryBuilder.getSummary();
    expect(sum.deliveriesSent).toBe(1);
    expect(sum.deliveriesRetried).toBe(1);
  });

  it('ORCH-DISPATCH-6: failed_permanent outcomes are counted', async () => {
    mockProcessingService.processNextDueDelivery
      .mockResolvedValueOnce({ outcome: 'failed_permanent' })
      .mockResolvedValueOnce({ outcome: 'none_due' });
    await dispatchService.dispatch(budget, summaryBuilder, new Date());
    expect(summaryBuilder.getSummary().deliveriesFailed).toBe(1);
  });

  it('ORCH-DISPATCH-7: cancelled outcomes are counted', async () => {
    mockProcessingService.processNextDueDelivery
      .mockResolvedValueOnce({ outcome: 'cancelled_by_subscriber' })
      .mockResolvedValueOnce({ outcome: 'none_due' });
    await dispatchService.dispatch(budget, summaryBuilder, new Date());
    expect(summaryBuilder.getSummary().deliveriesCancelled).toBe(1);
  });

  it('ORCH-DISPATCH-8: stale_claim outcomes do not corrupt counters', async () => {
    mockRecoveryService.recoverStaleClaims.mockResolvedValue({ recoveredCount: 5 });
    mockProcessingService.processNextDueDelivery.mockResolvedValue({ outcome: 'none_due' });
    await dispatchService.dispatch(budget, summaryBuilder, new Date());
    expect(summaryBuilder.getSummary().staleDeliveriesRecovered).toBe(5);
    expect(summaryBuilder.getSummary().deliveriesSent).toBe(0);
  });

  it('ORCH-DISPATCH-9: Loop is bounded, iterative, and non-recursive', async () => {
    // We already check max deliveries. We just verify the loop doesn't exceed it.
    mockProcessingService.processNextDueDelivery.mockResolvedValue({ outcome: 'sent' });
    await dispatchService.dispatch(budget, summaryBuilder, new Date());
    expect(mockProcessingService.processNextDueDelivery).toHaveBeenCalledTimes(25);
  });

  it('ORCH-DISPATCH-10: One isolated provider failure does not abort processing of another due delivery', async () => {
    mockProcessingService.processNextDueDelivery
      .mockResolvedValueOnce({ outcome: 'retry_scheduled' }) // provider failure
      .mockResolvedValueOnce({ outcome: 'sent' }) // next due delivery
      .mockResolvedValueOnce({ outcome: 'none_due' });
    await dispatchService.dispatch(budget, summaryBuilder, new Date());
    expect(summaryBuilder.getSummary().deliveriesSent).toBe(1);
    expect(summaryBuilder.getSummary().deliveriesRetried).toBe(1);
  });

  it('DISPATCH-CRIT: critical D1 failure stops the loop safely', async () => {
    mockProcessingService.processNextDueDelivery.mockRejectedValue(new Error('D1_ERROR'));
    await expect(dispatchService.dispatch(budget, summaryBuilder, new Date())).rejects.toThrow(
      'D1_ERROR'
    );
    // Loop stopped immediately after 1 call
    expect(mockProcessingService.processNextDueDelivery).toHaveBeenCalledTimes(1);
  });
});

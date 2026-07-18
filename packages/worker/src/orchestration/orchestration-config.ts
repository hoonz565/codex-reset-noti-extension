export interface OrchestrationConfig {
  leaseDurationMs: number;
  totalRunBudgetMs: number;
  deliveryDispatchBudgetMs: number;
  maxDeliveriesPerRun: number;
  recoveryBatchLimit: number;
  processingLeaseDurationMs: number;
}

export const defaultOrchestrationConfig: OrchestrationConfig = {
  leaseDurationMs: 60 * 1000, // 60s
  totalRunBudgetMs: 25 * 1000, // 25s
  deliveryDispatchBudgetMs: 15 * 1000, // 15s
  maxDeliveriesPerRun: 25,
  recoveryBatchLimit: 50,
  processingLeaseDurationMs: 60 * 1000, // 60s
};

export function validateOrchestrationConfig(config: OrchestrationConfig) {
  if (config.leaseDurationMs <= config.totalRunBudgetMs) {
    throw new Error('Lease duration must exceed the maximum run budget.');
  }
}

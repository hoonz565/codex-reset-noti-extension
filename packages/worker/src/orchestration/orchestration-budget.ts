import { OrchestrationConfig } from './orchestration-config';

export class OrchestrationBudget {
  private startTime: number;

  constructor(
    private config: OrchestrationConfig,
    private clock: () => number = Date.now
  ) {
    this.startTime = this.clock();
  }

  get elapsedMs(): number {
    return this.clock() - this.startTime;
  }

  hasTotalTimeLeft(): boolean {
    return this.elapsedMs < this.config.totalRunBudgetMs;
  }

  hasDispatchTimeLeft(dispatchStartMs: number): boolean {
    const dispatchElapsed = this.clock() - dispatchStartMs;
    return dispatchElapsed < this.config.deliveryDispatchBudgetMs && this.hasTotalTimeLeft();
  }
}

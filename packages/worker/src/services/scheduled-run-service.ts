import { OrchestrationRunner } from '../orchestration';

export class ScheduledRunService {
  constructor(private runner: OrchestrationRunner) {}

  async execute(): Promise<void> {
    try {
      await this.runner.run('scheduled', new Date().toISOString());
    } catch (e) {
      // Outer boundary catches everything so worker doesn't crash unhandled.
      // Observability can log this.
      console.error('Unhandled orchestration failure:', e);
    }
  }
}

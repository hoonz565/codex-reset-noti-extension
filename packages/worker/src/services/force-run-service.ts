import { OrchestrationRunner, OrchestrationRunResult } from '../orchestration';

export class ForceRunService {
  constructor(private runner: OrchestrationRunner) {}

  async execute(): Promise<OrchestrationRunResult> {
    return this.runner.run('admin', new Date().toISOString());
  }
}

import { StatusClient } from '../api/status-client';
import { StatusViewModel } from './status-view-model';

export class StatusController {
  constructor(
    private client: StatusClient,
    private viewModel: StatusViewModel
  ) {}

  async refreshStatus(): Promise<void> {
    this.viewModel.setLoading();
    try {
      const response = await this.client.getStatus();
      this.viewModel.setSuccess(response.status);
    } catch (err: unknown) {
      this.viewModel.setError((err as Error).message || 'Unknown error');
    }
  }
}

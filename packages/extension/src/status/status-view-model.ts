import { PublicResetStatus } from '@codex-reset/shared';

export type StatusViewState =
  | { type: 'loading'; oldData?: PublicResetStatus }
  | { type: 'error'; message: string; oldData?: PublicResetStatus }
  | { type: 'success'; data: PublicResetStatus };

export class StatusViewModel {
  private state: StatusViewState = { type: 'loading' };
  private listeners: Set<(state: StatusViewState) => void> = new Set();

  subscribe(listener: (state: StatusViewState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  setLoading() {
    if (this.state.type === 'success') {
      this.state = { type: 'loading', oldData: this.state.data };
    } else if (this.state.type === 'error') {
      this.state = { type: 'loading', oldData: this.state.oldData };
    } else {
      // Already loading, do nothing
    }
    this.notify();
  }

  setSuccess(data: PublicResetStatus) {
    this.state = { type: 'success', data };
    this.notify();
  }

  setError(message: string) {
    let oldData: PublicResetStatus | undefined;
    if (this.state.type === 'success') {
      oldData = this.state.data;
    } else if (this.state.type === 'loading' || this.state.type === 'error') {
      oldData = this.state.oldData;
    }
    this.state = { type: 'error', message, oldData };
    this.notify();
  }

  getState(): StatusViewState {
    return this.state;
  }
}

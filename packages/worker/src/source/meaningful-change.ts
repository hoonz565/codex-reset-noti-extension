import type { CodexResetStatus } from '@codex-reset/shared';

export class MeaningfulChangeClassifier {
  static getProbabilityBand(prob: number | null): number {
    if (prob === null) return -1;
    if (prob >= 0 && prob <= 25) return 0;
    if (prob >= 26 && prob <= 47) return 1;
    if (prob >= 48 && prob <= 69) return 2;
    if (prob >= 70 && prob <= 100) return 3;
    return -1;
  }

  static isMeaningful(previous: CodexResetStatus | null, current: CodexResetStatus): boolean {
    if (!previous) {
      return true;
    }

    if (previous.lifecycle !== current.lifecycle) return true;
    if (previous.latestResetAt !== current.latestResetAt) return true;
    if (previous.resetCycleId !== current.resetCycleId) return true;
    if (previous.sourceHealth !== current.sourceHealth) return true;

    const prevBand = this.getProbabilityBand(previous.probability);
    const currBand = this.getProbabilityBand(current.probability);
    if (prevBand !== currBand) return true;

    const prevSignalId = previous.latestSignal?.id ?? null;
    const currSignalId = current.latestSignal?.id ?? null;
    if (prevSignalId !== currSignalId) return true;

    return false;
  }
}

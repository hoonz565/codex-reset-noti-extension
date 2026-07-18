export class DeliveryRetryPolicy {
  static readonly MAX_ATTEMPTS = 5;

  static getNextAttemptDelaySeconds(attemptCount: number): number | null {
    if (attemptCount >= this.MAX_ATTEMPTS) {
      return null; // Should transition to failed_permanent
    }

    switch (attemptCount) {
      case 1:
        return 60; // 1 minute
      case 2:
        return 300; // 5 minutes
      case 3:
        return 900; // 15 minutes
      case 4:
        return 3600; // 1 hour
      default:
        return 60; // Fallback
    }
  }

  static calculateNextAttemptAt(
    currentAttemptCount: number,
    now: Date,
    providerRetryAfterSeconds: number | null
  ): string | null {
    if (currentAttemptCount >= this.MAX_ATTEMPTS) {
      return null;
    }

    let delay = this.getNextAttemptDelaySeconds(currentAttemptCount);
    if (delay === null) return null;

    if (providerRetryAfterSeconds !== null) {
      // Respect provider Retry-After within reasonable bounds (min 1m, max 1h)
      const clampedRetryAfter = Math.max(60, Math.min(providerRetryAfterSeconds, 3600));
      delay = Math.max(delay, clampedRetryAfter);
    }

    return new Date(now.getTime() + delay * 1000).toISOString();
  }
}

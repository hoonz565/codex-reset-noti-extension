export class MetricsDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetricsDatabaseError';
  }
}

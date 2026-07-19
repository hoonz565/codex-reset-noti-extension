export class StatusDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StatusDatabaseError';
  }
}

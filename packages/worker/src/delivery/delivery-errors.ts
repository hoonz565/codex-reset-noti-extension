export class DeliveryPreparationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeliveryPreparationError';
  }
}

export class DeliveryRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeliveryRepositoryError';
  }
}

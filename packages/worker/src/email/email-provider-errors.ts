export class EmailProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailProviderError';
  }
}

export class RetryableProviderError extends EmailProviderError {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableProviderError';
  }
}

export class PermanentProviderError extends EmailProviderError {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentProviderError';
  }
}

export class EmailTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailTemplateError';
  }
}

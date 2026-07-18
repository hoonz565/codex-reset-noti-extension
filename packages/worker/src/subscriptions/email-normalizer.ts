import { SubscriptionError } from './subscription-errors';

export class EmailNormalizer {
  // eslint-disable-next-line no-control-regex
  private static readonly CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F-\x9F]|\r|\n/;

  static normalize(rawEmail: string): string {
    if (!rawEmail) {
      throw new SubscriptionError('INVALID_EMAIL', 'Email cannot be empty');
    }
    if (rawEmail.length > 255) {
      throw new SubscriptionError('INVALID_EMAIL', 'Email exceeds maximum length');
    }
    const trimmed = rawEmail.trim();
    if (this.CONTROL_CHAR_PATTERN.test(trimmed)) {
      throw new SubscriptionError('INVALID_EMAIL', 'Email contains invalid control characters');
    }
    if (!trimmed.includes('@')) {
      throw new SubscriptionError('INVALID_EMAIL', 'Malformed email address');
    }
    return trimmed.toLowerCase();
  }
}

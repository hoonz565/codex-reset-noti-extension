import { SubscriptionPreferences } from '@codex-reset/shared';
import { SubscriptionError } from './subscription-errors';

export class SubscriptionValidator {
  static validatePreferences(prefs: unknown): SubscriptionPreferences {
    if (!prefs || typeof prefs !== 'object') {
      throw new SubscriptionError('INVALID_PREFERENCES', 'Preferences must be an object');
    }

    const typedPrefs = prefs as Record<string, unknown>;

    // Reject unknown keys explicitly (even though zod strict does this, it's good to have domain-level enforcement if called directly)
    const allowedKeys = ['probability70', 'resetAnnounced'];
    const keys = Object.keys(typedPrefs);
    for (const key of keys) {
      if (!allowedKeys.includes(key)) {
        throw new SubscriptionError('INVALID_PREFERENCES', `Unknown preference key: ${key}`);
      }
    }

    if (
      typeof typedPrefs.probability70 !== 'boolean' ||
      typeof typedPrefs.resetAnnounced !== 'boolean'
    ) {
      throw new SubscriptionError('INVALID_PREFERENCES', 'Preferences must be boolean');
    }

    if (!typedPrefs.probability70 && !typedPrefs.resetAnnounced) {
      throw new SubscriptionError(
        'INVALID_PREFERENCES',
        'At least one subscription alert must be selected'
      );
    }

    return {
      probability70: typedPrefs.probability70,
      resetAnnounced: typedPrefs.resetAnnounced,
    };
  }
}

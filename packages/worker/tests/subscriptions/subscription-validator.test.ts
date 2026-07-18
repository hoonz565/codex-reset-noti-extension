import { describe, it, expect } from 'vitest';
import { SubscriptionValidator } from '../../src/subscriptions/subscription-validator';

describe('SubscriptionValidator', () => {
  it('SUB-PREF-1: accepts valid boolean preferences', () => {
    const prefs = { probability70: true, resetAnnounced: false };
    expect(SubscriptionValidator.validatePreferences(prefs)).toEqual(prefs);
  });

  it('SUB-PREF-2: accepts both alerts being true', () => {
    const prefs = { probability70: true, resetAnnounced: true };
    expect(SubscriptionValidator.validatePreferences(prefs)).toEqual(prefs);
  });

  it('SUB-PREF-3: rejects if both alerts are false', () => {
    const prefs = { probability70: false, resetAnnounced: false };
    expect(() => SubscriptionValidator.validatePreferences(prefs)).toThrow(
      'At least one subscription alert must be selected'
    );
  });

  it('SUB-PREF-4: rejects missing preferences', () => {
    expect(() => SubscriptionValidator.validatePreferences(null)).toThrow(
      'Preferences must be an object'
    );
    expect(() => SubscriptionValidator.validatePreferences(undefined)).toThrow(
      'Preferences must be an object'
    );
  });

  it('SUB-PREF-5: rejects non-boolean preference values', () => {
    expect(() =>
      SubscriptionValidator.validatePreferences({ probability70: 'true', resetAnnounced: false })
    ).toThrow('Preferences must be boolean');
  });

  it('SUB-PREF-6: rejects unknown preference keys', () => {
    const prefs = { probability70: true, resetAnnounced: false, unknownAlert: true };
    expect(() => SubscriptionValidator.validatePreferences(prefs)).toThrow(
      'Unknown preference key: unknownAlert'
    );
  });

  it('SUB-PREF-7: explicitly rejects probability90 or resetCompleted', () => {
    expect(() =>
      SubscriptionValidator.validatePreferences({
        probability70: true,
        resetAnnounced: false,
        probability90: true,
      })
    ).toThrow('Unknown preference key: probability90');
    expect(() =>
      SubscriptionValidator.validatePreferences({
        probability70: true,
        resetAnnounced: false,
        resetCompleted: true,
      })
    ).toThrow('Unknown preference key: resetCompleted');
  });
});

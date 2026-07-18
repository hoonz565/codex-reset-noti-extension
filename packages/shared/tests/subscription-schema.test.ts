import { describe, it, expect } from 'vitest';
import { alertPreferencesSchema } from '../src/schemas/subscription.schema';
import { createSubscriptionRequestSchema } from '../src/schemas/api.schema';

describe('subscription.schema', () => {
  it('Valid two-alert preferences pass', () => {
    const valid = {
      probability70: true,
      resetAnnounced: true,
    };
    expect(() => alertPreferencesSchema.parse(valid)).not.toThrow();
  });

  it('Both alert preferences false fail', () => {
    const invalid = {
      probability70: false,
      resetAnnounced: false,
    };
    expect(() => alertPreferencesSchema.parse(invalid)).toThrow();
  });

  it('probability90 is rejected', () => {
    const invalid = {
      probability70: true,
      resetAnnounced: true,
      probability90: true, // Unknown key
    };
    expect(() => alertPreferencesSchema.parse(invalid)).toThrow();
  });

  it('resetCompleted is rejected', () => {
    const invalid = {
      probability70: true,
      resetAnnounced: true,
      resetCompleted: true, // Unknown key
    };
    expect(() => alertPreferencesSchema.parse(invalid)).toThrow();
  });

  it('createSubscriptionRequestSchema validates email and preferences', () => {
    const valid = {
      email: 'test@example.com',
      preferences: {
        probability70: true,
        resetAnnounced: false,
      },
    };
    expect(() => createSubscriptionRequestSchema.parse(valid)).not.toThrow();
  });
});

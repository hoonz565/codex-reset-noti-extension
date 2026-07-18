import { describe, it, expect } from 'vitest';
import { EmailNormalizer } from '../../src/subscriptions/email-normalizer';

describe('EmailNormalizer', () => {
  it('SUB-EMAIL-1: trims surrounding whitespace', () => {
    expect(EmailNormalizer.normalize('  test@example.com  ')).toBe('test@example.com');
  });

  it('SUB-EMAIL-2: lowercases the entire email address', () => {
    expect(EmailNormalizer.normalize('TEST.Name+Tag@EXAMPLE.COM')).toBe(
      'test.name+tag@example.com'
    );
  });

  it('SUB-EMAIL-3: rejects control characters', () => {
    expect(() => EmailNormalizer.normalize('test\x00@example.com')).toThrow(
      'Email contains invalid control characters'
    );
  });

  it('SUB-EMAIL-4: rejects newlines', () => {
    expect(() => EmailNormalizer.normalize('test\n@example.com')).toThrow(
      'Email contains invalid control characters'
    );
  });

  it('SUB-EMAIL-5: enforces maximum length of 255 characters', () => {
    const longName = 'a'.repeat(260);
    expect(() => EmailNormalizer.normalize(`${longName}@b.c`)).toThrow(
      'Email exceeds maximum length'
    );
  });

  it('SUB-EMAIL-6: does not remove plus tags', () => {
    expect(EmailNormalizer.normalize('user+tag@example.com')).toBe('user+tag@example.com');
  });

  it('SUB-EMAIL-7: does not remove provider-specific dots', () => {
    expect(EmailNormalizer.normalize('first.last@gmail.com')).toBe('first.last@gmail.com');
  });

  it('throws on missing @ sign', () => {
    expect(() => EmailNormalizer.normalize('invalid-email')).toThrow('Malformed email address');
  });

  it('throws on empty string', () => {
    expect(() => EmailNormalizer.normalize('')).toThrow('Email cannot be empty');
  });
});

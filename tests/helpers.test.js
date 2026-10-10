import { describe, it, expect } from 'vitest';
import { generateOrderNumber, generateOTP, slugify, calculateDiscount, isStrongPassword } from '../src/utils/helpers.js';

describe('generateOrderNumber', () => {
  it('generates order numbers with CB prefix and unique suffix', () => {
    const a = generateOrderNumber();
    const b = generateOrderNumber();
    expect(a).toMatch(/^CB-[A-Z0-9]+-[A-Z0-9]{4}$/);
    expect(a).not.toBe(b);
  });
});

describe('generateOTP', () => {
  it('returns a 6-digit numeric string', () => {
    const otp = generateOTP();
    expect(otp).toMatch(/^\d{6}$/);
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Leather Crossbody Bag')).toBe('leather-crossbody-bag');
    expect(slugify('  A  B   ')).toBe('a-b');
    expect(slugify('Café')).toBe('caf');
  });
});

describe('calculateDiscount', () => {
  it('applies percentage discount rounded to 2 decimals', () => {
    expect(calculateDiscount(100, 10)).toBe(90);
    expect(calculateDiscount(999, 10)).toBe(899.1);
  });
});

describe('isStrongPassword', () => {
  it('validates upper/lower/number/special and length', () => {
    expect(isStrongPassword('Admin@2026x').valid).toBe(true);
    expect(isStrongPassword('short').valid).toBe(false);
    expect(isStrongPassword('onlylowercase1!').valid).toBe(false);
    expect(isStrongPassword('NoSpecial123').valid).toBe(false);
  });
});
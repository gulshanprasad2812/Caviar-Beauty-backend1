import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateOTP,
  hashOtp,
  matchesOtp,
  otpExpiry,
  isExpired,
  maskEmail,
  maskPhone,
  MAX_OTP_ATTEMPTS,
  OTP_LENGTH,
} from '../src/utils/otp.js';
import { getEmailConfig } from '../src/services/email.js';
import { getSmsConfig, getPublicSmsConfig, sendSms } from '../src/services/sms.js';

const ENV_KEYS = [
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER',
  'OTP_SECRET', 'JWT_SECRET', 'NODE_ENV',
];

let saved;

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
});

describe('OTP generation', () => {
  it('produces a numeric code of the expected length', () => {
    for (let i = 0; i < 200; i += 1) {
      const otp = generateOTP();
      expect(otp).toMatch(new RegExp(`^\\d{${OTP_LENGTH}}$`));
    }
  });

  it('does not repeat itself (CSPRNG sanity check)', () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateOTP()));
    expect(codes.size).toBeGreaterThan(400);
  });
});

describe('OTP hashing', () => {
  beforeEach(() => { process.env.OTP_SECRET = 'unit-test-otp-secret'; });

  it('never stores the plaintext code', () => {
    const otp = '123456';
    const hashed = hashOtp(otp);
    expect(hashed).not.toBe(otp);
    expect(hashed).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic for the same code and key', () => {
    expect(hashOtp('654321')).toBe(hashOtp('654321'));
  });

  it('accepts the matching code and rejects a different one', () => {
    const hashed = hashOtp('111222');
    expect(matchesOtp(hashed, '111222')).toBe(true);
    expect(matchesOtp(hashed, '111223')).toBe(false);
    expect(matchesOtp(hashed, '')).toBe(false);
  });

  it('still accepts legacy plaintext codes already in the database', () => {
    expect(matchesOtp('123456', '123456')).toBe(true);
    expect(matchesOtp('123456', '654321')).toBe(false);
  });
});

describe('OTP expiry', () => {
  it('is in the future when created and expired in the past', () => {
    expect(isExpired(otpExpiry())).toBe(false);
    expect(isExpired(new Date(Date.now() - 1000))).toBe(true);
    expect(isExpired(null)).toBe(true);
  });

  it('caps attempts so a 6-digit code cannot be brute forced', () => {
    expect(MAX_OTP_ATTEMPTS).toBeGreaterThan(0);
    expect(MAX_OTP_ATTEMPTS).toBeLessThanOrEqual(10);
  });
});

describe('masking', () => {
  it('masks an email but keeps the first letter and domain', () => {
    expect(maskEmail('jane.doe@example.com')).toBe('j*******@example.com');
    expect(maskEmail('not-an-email')).toBe('***');
  });

  it('keeps only the last four digits of a phone number', () => {
    expect(maskPhone('+919876543210')).toBe('*********3210');
    expect(maskPhone('12')).toBe('****');
  });
});

describe('email configuration detection', () => {
  it('does NOT treat smtp.gmail.com as a placeholder (regression)', () => {
    process.env.SMTP_HOST = 'smtp.gmail.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'shop@gmail.com';
    process.env.SMTP_PASS = 'abcd efgh ijkl mnop';
    const config = getEmailConfig();
    expect(config.missing).toEqual([]);
    expect(config.configured).toBe(true);
  });

  it('reports missing credentials with the documented placeholders', () => {
    process.env.SMTP_HOST = 'smtp.gmail.com';
    process.env.SMTP_USER = 'your-email@gmail.com';
    process.env.SMTP_PASS = 'your-app-password';
    const config = getEmailConfig();
    expect(config.configured).toBe(false);
    expect(config.missing).toContain('SMTP_USER');
    expect(config.missing).toContain('SMTP_PASS');
  });

  it('falls back to SMTP_USER for the from address', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'shop@example.com';
    process.env.SMTP_PASS = 'secret';
    expect(getEmailConfig().from).toBe('shop@example.com');
    process.env.MAIL_FROM = 'no-reply@example.com';
    expect(getEmailConfig().from).toBe('no-reply@example.com');
  });
});

describe('SMS configuration detection', () => {
  it('is not configured while the Twilio values are placeholders', () => {
    process.env.TWILIO_ACCOUNT_SID = 'your_twilio_account_sid';
    process.env.TWILIO_AUTH_TOKEN = 'your_twilio_auth_token';
    process.env.TWILIO_FROM_NUMBER = '+10000000000';
    const config = getSmsConfig();
    expect(config.configured).toBe(false);
    expect(config.missing).toEqual(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER']);
  });

  it('is configured with real-looking credentials and hides the token publicly', () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC' + 'a'.repeat(32);
    process.env.TWILIO_AUTH_TOKEN = 'f'.repeat(32);
    process.env.TWILIO_FROM_NUMBER = '+14155550123';
    const config = getSmsConfig();
    expect(config.configured).toBe(true);
    const publicConfig = getPublicSmsConfig();
    expect(publicConfig.configured).toBe(true);
    expect(JSON.stringify(publicConfig)).not.toContain('f'.repeat(32));
  });

  it('mocks delivery instead of throwing when not configured', async () => {
    process.env.NODE_ENV = 'test';
    process.env.TWILIO_ACCOUNT_SID = '';
    process.env.TWILIO_AUTH_TOKEN = '';
    process.env.TWILIO_FROM_NUMBER = '';
    const result = await sendSms('+919876543210', 'code 123456');
    expect(result).toMatchObject({ delivered: false, mocked: true });
  });

  it('posts to the Twilio REST API when configured', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC' + 'a'.repeat(32);
    process.env.TWILIO_AUTH_TOKEN = 'f'.repeat(32);
    process.env.TWILIO_FROM_NUMBER = '+14155550123';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sid: 'SM123' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendSms('+919876543210', 'Your code is 123456');
    expect(result).toMatchObject({ delivered: true, provider: 'twilio', sid: 'SM123' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/2010-04-01/Accounts/AC');
    expect(options.method).toBe('POST');
    expect(String(options.body)).toContain('To=%2B919876543210');
  });

  it('throws when Twilio rejects the request', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC' + 'a'.repeat(32);
    process.env.TWILIO_AUTH_TOKEN = 'f'.repeat(32);
    process.env.TWILIO_FROM_NUMBER = '+14155550123';

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Authentication Error',
    }));

    await expect(sendSms('+919876543210', 'code')).rejects.toThrow(/Twilio rejected the SMS/);
  });
});

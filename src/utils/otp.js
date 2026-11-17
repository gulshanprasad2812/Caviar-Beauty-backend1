import crypto from 'crypto';

/**
 * OTP primitives shared by email and SMS verification.
 *
 * Codes are generated with a CSPRNG, stored only as a keyed HMAC-SHA256 digest,
 * and compared in constant time. Attempts are counted so a 6-digit code cannot
 * be brute forced (1e6 possibilities is small for an attacker who can retry).
 */
export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 15 * 60 * 1000;
export const MAX_OTP_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

/** Cryptographically secure 6-digit code (100000-999999). */
export const generateOTP = () =>
  crypto.randomInt(10 ** (OTP_LENGTH - 1), 10 ** OTP_LENGTH).toString();

const hmacKey = () => process.env.OTP_SECRET || process.env.JWT_SECRET || 'caviar-otp-development-key';

/** One-way digest of a code. The plaintext code is never persisted. */
export const hashOtp = (otp) => crypto.createHmac('sha256', hmacKey()).update(String(otp)).digest('hex');

export const safeEqual = (a, b) => {
  const left = Buffer.from(String(a ?? ''), 'utf8');
  const right = Buffer.from(String(b ?? ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

const HASH_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Compares a submitted code against the stored value. Accepts the HMAC digests
 * written by hashOtp() and, for codes issued before this change, legacy
 * plaintext codes.
 */
export const matchesOtp = (stored, otp) => {
  if (!stored || otp == null) return false;
  const submitted = String(otp).trim();
  if (HASH_PATTERN.test(stored)) return safeEqual(stored, hashOtp(submitted));
  return safeEqual(stored, submitted);
};

export const otpExpiry = () => new Date(Date.now() + OTP_TTL_MS);

export const isExpired = (expiry) => !expiry || new Date(expiry).getTime() < Date.now();

/** j***e@example.com */
export const maskEmail = (email) => {
  const value = String(email || '');
  const at = value.indexOf('@');
  if (at < 1) return '***';
  const name = value.slice(0, at);
  const domain = value.slice(at);
  const visible = name.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(1, name.length - 1))}${domain}`;
};

/** +91******3210 */
export const maskPhone = (phone) => {
  const value = String(phone || '');
  if (value.length <= 4) return '****';
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
};

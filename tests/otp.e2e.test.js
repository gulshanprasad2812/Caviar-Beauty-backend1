/**
 * End-to-end OTP / verification test.
 *
 * Exercises the real routes against the database in DATABASE_URL:
 *   - email OTP: wrong code rejected (and counted), correct code verifies
 *   - attempt cap: an exhausted counter returns 429
 *   - phone OTP: send stores a hashed code, verify marks the number verified
 *
 * Run with: npm run test:otp:e2e   (or npm run test:payments:e2e)
 * Creates and removes its own fixture user; makes no network calls.
 */
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { generateToken } from '../src/utils/helpers.js';
import { hashOtp, matchesOtp, otpExpiry, MAX_OTP_ATTEMPTS } from '../src/utils/otp.js';

const EMAIL = 'e2e-otp@test.com';
const PHONE = '+919812345670';

let token = '';
let userId = '';

async function cleanup() {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (user) await prisma.user.delete({ where: { id: user.id } });
}

describe('OTP verification end to end', () => {
  beforeAll(async () => {
    await cleanup();
    const user = await prisma.user.create({
      data: {
        email: EMAIL,
        password: await bcrypt.hash('E2ePass123!', 10),
        firstName: 'E2E',
        lastName: 'Otp',
        phone: PHONE,
        isVerified: false,
      },
    });
    userId = user.id;
    token = generateToken(user.id, user.email, user.role);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const issue = (otp, purpose = 'email-verification') =>
    prisma.user.update({ where: { id: userId }, data: { otp: hashOtp(otp), otpExpiry: otpExpiry(), otpAttempts: 0 } });

  it('reports the verification channel configuration publicly', async () => {
    const res = await request(app).get('/api/auth/verification/config');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      email: { channel: 'email' },
      sms: { channel: 'sms', provider: 'twilio' },
    });
    expect(typeof res.body.email.configured).toBe('boolean');
    expect(typeof res.body.sms.configured).toBe('boolean');
  });

  it('rejects a wrong email code and records the attempt', async () => {
    await issue('111111');
    const res = await request(app).post('/api/auth/verify-otp').send({ email: EMAIL, otp: '999999' });
    expect(res.status).toBe(400);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.isVerified).toBe(false);
    expect(user.otpAttempts).toBe(1);
  });

  it('verifies a correct email code and clears the stored OTP', async () => {
    await issue('222222');
    const res = await request(app).post('/api/auth/verify-otp').send({ email: EMAIL, otp: '222222' });
    expect(res.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.isVerified).toBe(true);
    expect(user.otp).toBeNull();
    expect(user.otpExpiry).toBeNull();
  });

  it('returns 429 once the attempt cap is reached', async () => {
    await prisma.user.update({ where: { id: userId }, data: { otpAttempts: MAX_OTP_ATTEMPTS } });
    const res = await request(app).post('/api/auth/verify-otp').send({ email: EMAIL, otp: '333333' });
    expect(res.status).toBe(429);
  });

  it('stores a hashed code when an SMS OTP is requested', async () => {
    const res = await request(app).post('/api/auth/phone/send-otp').set(auth()).send({ phone: PHONE });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('smsSent');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.phoneOtp).toMatch(/^[a-f0-9]{64}$/);
    expect(user.phoneOtpAttempts).toBe(0);
    expect(user.phoneVerified).toBe(false);
  });

  it('verifies the phone code and marks the number verified', async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { phoneOtp: hashOtp('444444'), phoneOtpExpiry: otpExpiry(), phoneOtpAttempts: 0 },
    });
    const res = await request(app).post('/api/auth/phone/verify-otp').set(auth()).send({ otp: '444444' });
    expect(res.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.phoneVerified).toBe(true);
    expect(user.phoneOtp).toBeNull();
  });

  it('rejects a stale phone code', async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { phoneOtp: hashOtp('555555'), phoneOtpExpiry: new Date(Date.now() - 1000), phoneOtpAttempts: 0 },
    });
    const res = await request(app).post('/api/auth/phone/verify-otp').set(auth()).send({ otp: '555555' });
    expect(res.status).toBe(400);
    // Sanity check on the primitive used by the endpoint.
    expect(matchesOtp(hashOtp('555555'), '555555')).toBe(true);
  });
});

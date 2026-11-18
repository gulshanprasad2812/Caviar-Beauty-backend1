import { prisma } from '../db.js';
import { hashPassword, comparePassword, generateToken, generateRefreshToken, isStrongPassword } from '../utils/helpers.js';
import { generateOTP, hashOtp, matchesOtp, otpExpiry, isExpired, MAX_OTP_ATTEMPTS } from '../utils/otp.js';
import { AppError } from '../middleware/errorHandler.js';
import { sendForgotPasswordOTP, sendVerificationOTP, sendWelcomeEmail, isEmailConfigured } from '../services/email.js';
import { sendPhoneOtp, isSmsConfigured } from '../services/sms.js';
import { isFirebaseConfigured, verifyFirebaseIdToken } from '../services/firebase.js';
import { verifyGoogleAccessToken, verifyAppleIdentityToken } from '../utils/oauth.js';
import { z } from 'zod';

const authCookieOptions = () => ({
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
});

const passwordSchema = z.string().min(8).refine((p) => {
  const { valid } = isStrongPassword(p);
  return valid;
}, 'Password must be at least 8 characters with uppercase, lowercase, number, and special character');

const registerSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
  password: z.string(),
});

/** Keeps only digits and a leading +, so stored numbers are consistent. */
const normalizePhone = (phone) => {
  const value = String(phone || '').trim();
  const hasPlus = value.startsWith('+');
  const digits = value.replace(/\D/g, '');
  return `${hasPlus ? '+' : ''}${digits}`;
};

const isValidPhone = (phone) => phone.replace(/\D/g, '').length >= 10;

const lower = (email) => String(email || '').trim().toLowerCase();

/**
 * Public: lets the storefront tell the user up front whether verification codes
 * can actually be delivered (never exposes credentials).
 */
/**
 * Describes the active phone-verification channel. With Firebase the SMS is
 * sent by the client SDK, so `clientSend` tells the web app to use it.
 */
const smsChannelConfig = () => {
  if (isFirebaseConfigured()) {
    return { channel: 'sms', provider: 'firebase', configured: true, clientSend: true };
  }
  if (isSmsConfigured()) {
    return { channel: 'sms', provider: 'twilio', configured: true, clientSend: false };
  }
  return { channel: 'sms', provider: 'none', configured: false, clientSend: false };
};

export const getVerificationConfig = (_req, res) => {
  res.json({
    email: { channel: 'email', configured: isEmailConfigured() },
    sms: smsChannelConfig(),
  });
};

export const register = async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const email = lower(data.email);
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) throw new AppError(409, 'Email already registered');

    const hashed = await hashPassword(data.password);
    const phone = data.phone ? normalizePhone(data.phone) : null;
    const user = await prisma.user.create({
      data: { email, password: hashed, firstName: data.firstName, lastName: data.lastName, ...(phone ? { phone } : {}), provider: 'email' },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isVerified: true },
    });

    // Email verification code (hashed at rest).
    const emailOtp = generateOTP();
    const phoneOtp = phone ? generateOTP() : null;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        otp: hashOtp(emailOtp),
        otpExpiry: otpExpiry(),
        otpAttempts: 0,
        ...(phoneOtp ? { phoneOtp: hashOtp(phoneOtp), phoneOtpExpiry: otpExpiry(), phoneOtpAttempts: 0 } : {}),
      },
    });

    const [emailResult, smsResult] = await Promise.all([
      sendVerificationOTP(email, emailOtp, data.firstName),
      phoneOtp
        ? sendPhoneOtp(phone, phoneOtp, data.firstName).catch((err) => {
            console.error('[PHONE OTP] register send failed:', err.message);
            return { delivered: false, provider: 'twilio', error: err.message };
          })
        : Promise.resolve(null),
    ]);
    await sendWelcomeEmail(email, data.firstName).catch(() => {});

    const token = generateToken(user.id, user.email, user.role);
    const refreshToken = generateRefreshToken(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

    res.cookie('token', token, { httpOnly: true, ...authCookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { httpOnly: true, ...authCookieOptions(), maxAge: 30 * 24 * 60 * 60 * 1000, path: '/api/auth/refresh-token' });
    res.status(201).json({
      user,
      token,
      verification: {
        emailSent: !!emailResult?.delivered,
        phoneSent: !!smsResult?.delivered,
        phoneRequested: !!phoneOtp,
        smsConfigured: isSmsConfigured(),
      },
    });
  } catch (err) { next(err); }
};

export const adminLogin = async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user || user.role !== 'ADMIN') throw new AppError(401, 'Invalid admin credentials');
    if (!user.isActive) throw new AppError(401, 'Account is deactivated');

    const valid = await comparePassword(data.password, user.password);
    if (!valid) throw new AppError(401, 'Invalid admin credentials');

    const token = generateToken(user.id, user.email, user.role);
    const refreshToken = generateRefreshToken(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

    res.cookie('token', token, { httpOnly: true, ...authCookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { httpOnly: true, ...authCookieOptions(), maxAge: 30 * 24 * 60 * 60 * 1000, path: '/api/auth/refresh-token' });
    res.json({ user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, mustChangePassword: user.mustChangePassword }, token });
  } catch (err) { next(err); }
};

export const login = async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user || !user.isActive) throw new AppError(401, 'Invalid email or password');

    const valid = await comparePassword(data.password, user.password);
    if (!valid) throw new AppError(401, 'Invalid email or password');

    const token = generateToken(user.id, user.email, user.role);
    const refreshToken = generateRefreshToken(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

    res.cookie('token', token, { httpOnly: true, ...authCookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { httpOnly: true, ...authCookieOptions(), maxAge: 30 * 24 * 60 * 60 * 1000, path: '/api/auth/refresh-token' });
    res.json({ user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, isVerified: user.isVerified, phone: user.phone, phoneVerified: user.phoneVerified }, token });
  } catch (err) { next(err); }
};

export const logout = async (req, res, next) => {
  try {
    await prisma.user.update({ where: { id: req.user.id }, data: { refreshToken: null } });
    res.clearCookie('token');
    res.clearCookie('refreshToken', { path: '/api/auth/refresh-token' });
    res.json({ message: 'Logged out successfully' });
  } catch (err) { next(err); }
};

export const refreshToken = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!token) throw new AppError(401, 'Refresh token required');
    const jwt = (await import('jsonwebtoken')).default;
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user || user.refreshToken !== token || !user.isActive) throw new AppError(401, 'Invalid refresh token');

    const newToken = generateToken(user.id, user.email, user.role);
    const newRefresh = generateRefreshToken(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { refreshToken: newRefresh } });

    res.cookie('token', newToken, { httpOnly: true, ...authCookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.cookie('refreshToken', newRefresh, { httpOnly: true, ...authCookieOptions(), maxAge: 30 * 24 * 60 * 60 * 1000, path: '/api/auth/refresh-token' });
    res.json({ token: newToken });
  } catch (err) { next(err); }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const email = lower(req.body?.email);
    if (!email) throw new AppError(400, 'Email is required');
    const user = await prisma.user.findUnique({ where: { email } });
    // Always answer identically so the endpoint cannot enumerate accounts.
    const generic = { message: 'If that email is registered, a reset code has been sent.' };
    if (!user) return res.json({ ...generic, emailSent: false });

    const otp = generateOTP();
    await prisma.user.update({ where: { id: user.id }, data: { otp: hashOtp(otp), otpExpiry: otpExpiry(), otpAttempts: 0 } });
    const result = await sendForgotPasswordOTP(email, otp, user.firstName);
    res.json({ ...generic, emailSent: !!result?.delivered });
  } catch (err) { next(err); }
};

export const resetPassword = async (req, res, next) => {
  try {
    const email = lower(req.body?.email);
    const { otp, password } = req.body;
    if (!password || password.length < 8) throw new AppError(400, 'Password must be at least 8 characters');
    const { valid } = isStrongPassword(password);
    if (!valid) throw new AppError(400, 'Password must include uppercase, lowercase, number, and special character');
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppError(400, 'Invalid or expired reset code');
    if ((user.otpAttempts || 0) >= MAX_OTP_ATTEMPTS) throw new AppError(429, 'Too many incorrect attempts. Request a new code.');
    if (isExpired(user.otpExpiry) || !matchesOtp(user.otp, otp)) {
      await prisma.user.update({ where: { id: user.id }, data: { otpAttempts: { increment: 1 } } });
      throw new AppError(400, 'Invalid or expired reset code');
    }

    const hashed = await hashPassword(password);
    const consumed = await prisma.user.updateMany({
      where: { id: user.id, otp: user.otp, otpExpiry: { gt: new Date() } },
      data: { password: hashed, otp: null, otpExpiry: null, otpAttempts: 0 },
    });
    if (consumed.count !== 1) throw new AppError(400, 'Invalid or expired reset code');
    res.json({ message: 'Password reset successfully' });
  } catch (err) { next(err); }
};

export const verifyOTP = async (req, res, next) => {
  try {
    const email = lower(req.body?.email);
    const { otp, purpose = 'email-verification' } = req.body;
    if (!['email-verification', 'password-reset'].includes(purpose)) throw new AppError(400, 'Invalid verification purpose');
    if (!email || !otp) throw new AppError(400, 'Email and code are required');

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppError(400, 'Invalid or expired verification code');
    if ((user.otpAttempts || 0) >= MAX_OTP_ATTEMPTS) throw new AppError(429, 'Too many incorrect attempts. Request a new code.');

    if (isExpired(user.otpExpiry) || !matchesOtp(user.otp, otp)) {
      await prisma.user.update({ where: { id: user.id }, data: { otpAttempts: { increment: 1 } } });
      throw new AppError(400, 'Invalid or expired verification code');
    }
    if (purpose === 'email-verification') {
      await prisma.user.update({ where: { id: user.id }, data: { isVerified: true, otp: null, otpExpiry: null, otpAttempts: 0 } });
    }
    res.json({ message: purpose === 'email-verification' ? 'Email verified successfully' : 'Code verified' });
  } catch (err) { next(err); }
};

export const resendOTP = async (req, res, next) => {
  try {
    const email = lower(req.body?.email);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppError(404, 'User not found');

    const otp = generateOTP();
    await prisma.user.update({ where: { id: user.id }, data: { otp: hashOtp(otp), otpExpiry: otpExpiry(), otpAttempts: 0 } });
    const result = user.isVerified
      ? await sendForgotPasswordOTP(email, otp, user.firstName)
      : await sendVerificationOTP(email, otp, user.firstName);

    if (!result?.delivered) {
      throw new AppError(502, 'Could not send the verification email. Please contact support or try again later.');
    }
    res.json({ message: 'Verification code sent', emailSent: true });
  } catch (err) { next(err); }
};

/** Authenticated: sends (or re-sends) an SMS code to the user's phone number. */
export const requestPhoneOTP = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) throw new AppError(404, 'User not found');

    const phone = normalizePhone(req.body?.phone || user.phone);
    if (!isValidPhone(phone)) throw new AppError(400, 'A valid phone number (at least 10 digits) is required');

    // With Firebase the SMS is sent by the browser SDK, not by this server.
    // Record the number so verification can mark the account.
    if (isFirebaseConfigured()) {
      await prisma.user.update({
        where: { id: user.id },
        data: { phone, phoneVerified: false },
      });
      return res.json({
        message: 'Verify your number with the Firebase client.',
        clientSend: true,
        smsSent: false,
        smsConfigured: true,
        smsProvider: 'firebase',
      });
    }

    const otp = generateOTP();
    await prisma.user.update({
      where: { id: user.id },
      data: { phone, phoneOtp: hashOtp(otp), phoneOtpExpiry: otpExpiry(), phoneOtpAttempts: 0, phoneVerified: false },
    });

    let result;
    try {
      result = await sendPhoneOtp(phone, otp, user.firstName);
    } catch (err) {
      console.error('[PHONE OTP] send failed:', err.message);
      throw new AppError(502, 'Could not send the SMS. Please check the SMS configuration.');
    }

    res.json({
      message: result.delivered
        ? 'Verification code sent to your phone'
        : 'SMS is not configured, so no text was sent. The code was logged on the server (development only).',
      clientSend: false,
      smsSent: !!result.delivered,
      smsConfigured: isSmsConfigured(),
      smsProvider: result.delivered ? 'twilio' : 'none',
    });
  } catch (err) { next(err); }
};

/**
 * Authenticated: marks the phone number verified.
 *
 * Accepts either a Firebase `idToken` (the code was checked by the client SDK
 * against Google) or the legacy Twilio `otp` (a code this server generated and
 * texted). Firebase is tried first when the token is present.
 */
export const verifyPhoneOTP = async (req, res, next) => {
  try {
    const { otp, idToken } = req.body || {};
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) throw new AppError(404, 'User not found');

    if (idToken) {
      const result = await verifyFirebaseIdToken(idToken);
      if (!result.ok) {
        console.warn(`[PHONE OTP] Firebase token rejected: ${result.reason}`);
        throw new AppError(400, 'Phone verification failed. Please request a new code.');
      }
      const phone = normalizePhone(result.phoneNumber);
      if (!isValidPhone(phone)) throw new AppError(400, 'Firebase returned an invalid phone number');

      await prisma.user.update({
        where: { id: user.id },
        data: { phone, phoneVerified: true, phoneOtp: null, phoneOtpExpiry: null, phoneOtpAttempts: 0 },
      });
      return res.json({ message: 'Phone number verified successfully', phoneVerified: true, phone, provider: 'firebase' });
    }

    if (!otp) throw new AppError(400, 'Verification code is required');
    if (!user?.phoneOtp) throw new AppError(400, 'No verification code was requested');
    if ((user.phoneOtpAttempts || 0) >= MAX_OTP_ATTEMPTS) throw new AppError(429, 'Too many incorrect attempts. Request a new code.');

    if (isExpired(user.phoneOtpExpiry) || !matchesOtp(user.phoneOtp, otp)) {
      await prisma.user.update({ where: { id: user.id }, data: { phoneOtpAttempts: { increment: 1 } } });
      throw new AppError(400, 'Invalid or expired verification code');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { phoneVerified: true, phoneOtp: null, phoneOtpExpiry: null, phoneOtpAttempts: 0 },
    });
    res.json({ message: 'Phone number verified successfully', phoneVerified: true, phone: user.phone, provider: 'twilio' });
  } catch (err) { next(err); }
};

export const googleAuth = async (req, res, next) => {
  try {
    const { accessToken } = req.body;
    const profile = await verifyGoogleAccessToken(accessToken);
    if (!profile) throw new AppError(401, 'Google authentication failed');
    const { email: rawEmail, firstName: googleFirstName, lastName: googleLastName, name, picture, providerId } = profile;
    const email = lower(rawEmail);
    const nameParts = (name || '').trim().split(/\s+/);
    const firstName = googleFirstName || nameParts[0] || '';
    const lastName = googleLastName || nameParts.slice(1).join(' ') || '';

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email, firstName, lastName, password: '', provider: 'google', providerId, isVerified: true, avatar: picture || null },
      });
      await sendWelcomeEmail(email, firstName).catch(() => {});
    } else if (!user.providerId && user.provider === 'email') {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          providerId,
          provider: 'google',
          isVerified: true,
          ...(user.avatar ? {} : { avatar: picture || null }),
          ...(user.firstName ? {} : { firstName }),
          ...(user.lastName ? {} : { lastName }),
        },
      });
    } else if (user.providerId !== providerId) {
      throw new AppError(401, 'Account is linked to a different Google account');
    }
    const token = generateToken(user.id, user.email, user.role);
    const refreshToken = generateRefreshToken(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });
    res.cookie('token', token, { httpOnly: true, ...authCookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { httpOnly: true, ...authCookieOptions(), maxAge: 30 * 24 * 60 * 60 * 1000, path: '/api/auth/refresh-token' });
    res.json({ user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, isVerified: user.isVerified }, token });
  } catch (err) { next(err); }
};

export const appleAuth = async (req, res, next) => {
  try {
    const { identityToken } = req.body;
    const profile = await verifyAppleIdentityToken(identityToken);
    if (!profile) throw new AppError(401, 'Apple authentication failed');
    const { email: rawEmail, firstName, lastName, providerId } = profile;
    const email = lower(rawEmail);

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email, firstName: firstName || '', lastName: lastName || '', password: '', provider: 'apple', providerId, isVerified: true },
      });
    } else if (user.providerId && user.providerId !== providerId) {
      throw new AppError(401, 'Account is linked to a different Apple account');
    }
    const token = generateToken(user.id, user.email, user.role);
    const refreshToken = generateRefreshToken(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });
    res.cookie('token', token, { httpOnly: true, ...authCookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { httpOnly: true, ...authCookieOptions(), maxAge: 30 * 24 * 60 * 60 * 1000, path: '/api/auth/refresh-token' });
    res.json({ user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, isVerified: user.isVerified }, token });
  } catch (err) { next(err); }
};

export const getMe = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, phoneVerified: true, avatar: true, role: true, isVerified: true, createdAt: true, addresses: true },
    });
    res.json(user);
  } catch (err) { next(err); }
};

export const updateProfile = async (req, res, next) => {
  try {
    const { firstName, lastName, phone, avatar } = req.body;
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { firstName, lastName, phone, avatar },
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, phoneVerified: true, avatar: true, role: true },
    });
    res.json(user);
  } catch (err) { next(err); }
};

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) throw new AppError(400, 'Current and new password required');
    const { valid } = isStrongPassword(newPassword);
    if (!valid) throw new AppError(400, 'Password must include uppercase, lowercase, number, and special character');

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user.password) throw new AppError(400, 'This account uses social login and has no password');
    const matches = await comparePassword(currentPassword, user.password);
    if (!matches) throw new AppError(401, 'Current password is incorrect');

    const hashed = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed, mustChangePassword: false } });
    res.json({ message: 'Password changed successfully' });
  } catch (err) { next(err); }
};

export const deleteAccount = async (req, res, next) => {
  try {
    const { password } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (user?.password) {
      const matches = await comparePassword(password || '', user.password);
      if (!matches) throw new AppError(401, 'Password is incorrect');
    }
    await prisma.user.delete({ where: { id: req.user.id } });
    res.clearCookie('token');
    res.clearCookie('refreshToken', { path: '/api/auth/refresh-token' });
    res.json({ message: 'Account deleted' });
  } catch (err) { next(err); }
};

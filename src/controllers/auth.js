import { prisma } from '../db.js';
import { hashPassword, comparePassword, generateToken, generateRefreshToken, generateOTP, isStrongPassword } from '../utils/helpers.js';
import { AppError } from '../middleware/errorHandler.js';
import { sendForgotPasswordOTP, sendVerificationOTP, sendWelcomeEmail } from '../services/email.js';
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

export const register = async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) throw new AppError(409, 'Email already registered');

    const hashed = await hashPassword(data.password);
    const user = await prisma.user.create({
      data: { ...data, password: hashed, provider: 'email' },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isVerified: true },
    });

    const otp = generateOTP();
    await prisma.user.update({ where: { id: user.id }, data: { otp, otpExpiry: new Date(Date.now() + 15 * 60 * 1000) } });

    await sendVerificationOTP(data.email, otp, data.firstName).catch(() => {});
    await sendWelcomeEmail(data.email, data.firstName).catch(() => {});

    const token = generateToken(user.id, user.email, user.role);
    const refreshToken = generateRefreshToken(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

    res.cookie('token', token, { httpOnly: true, ...authCookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { httpOnly: true, ...authCookieOptions(), maxAge: 30 * 24 * 60 * 60 * 1000, path: '/api/auth/refresh-token' });
    res.status(201).json({ user, token });
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
    res.json({ user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, isVerified: user.isVerified }, token });
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
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.json({ message: 'If that email is registered, a reset code has been sent.' });
    const otp = generateOTP();
    await prisma.user.update({ where: { id: user.id }, data: { otp, otpExpiry: new Date(Date.now() + 15 * 60 * 1000) } });
    await sendForgotPasswordOTP(email, otp, user.firstName).catch(() => {});
    res.json({ message: 'If that email is registered, a reset code has been sent.' });
  } catch (err) { next(err); }
};

export const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, password } = req.body;
    if (!password || password.length < 8) throw new AppError(400, 'Password must be at least 8 characters');
    const { valid } = isStrongPassword(password);
    if (!valid) throw new AppError(400, 'Password must include uppercase, lowercase, number, and special character');
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.otp !== otp || !user.otpExpiry || user.otpExpiry < new Date()) throw new AppError(400, 'Invalid or expired reset code');
    const hashed = await hashPassword(password);
    const consumed = await prisma.user.updateMany({
      where: { id: user.id, otp, otpExpiry: { gt: new Date() } },
      data: { password: hashed, otp: null, otpExpiry: null },
    });
    if (consumed.count !== 1) throw new AppError(400, 'Invalid or expired reset code');
    res.json({ message: 'Password reset successfully' });
  } catch (err) { next(err); }
};

export const verifyOTP = async (req, res, next) => {
  try {
    const { email, otp, purpose = 'email-verification' } = req.body;
    if (!['email-verification', 'password-reset'].includes(purpose)) throw new AppError(400, 'Invalid verification purpose');
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.otp !== otp || !user.otpExpiry || user.otpExpiry < new Date()) throw new AppError(400, 'Invalid or expired verification code');
    if (purpose === 'email-verification') {
      await prisma.user.update({ where: { id: user.id }, data: { isVerified: true, otp: null, otpExpiry: null } });
    }
    res.json({ message: purpose === 'email-verification' ? 'Email verified successfully' : 'Code verified' });
  } catch (err) { next(err); }
};

export const resendOTP = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppError(404, 'User not found');
    const otp = generateOTP();
    await prisma.user.update({ where: { id: user.id }, data: { otp, otpExpiry: new Date(Date.now() + 15 * 60 * 1000) } });
    if (!user.isVerified) {
      await sendVerificationOTP(email, otp, user.firstName).catch(() => {});
    } else {
      await sendForgotPasswordOTP(email, otp, user.firstName).catch(() => {});
    }
    res.json({ message: 'Verification code sent' });
  } catch (err) { next(err); }
};

export const googleAuth = async (req, res, next) => {
  try {
    const { accessToken } = req.body;
    const profile = await verifyGoogleAccessToken(accessToken);
    if (!profile) throw new AppError(401, 'Google authentication failed');
    const { email, firstName: googleFirstName, lastName: googleLastName, name, picture, providerId } = profile;
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
    const { email, firstName, lastName, providerId } = profile;

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
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, avatar: true, role: true, isVerified: true, createdAt: true, addresses: true },
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
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, avatar: true, role: true },
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

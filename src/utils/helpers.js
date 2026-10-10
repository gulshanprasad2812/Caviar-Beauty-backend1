import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export const generateToken = (userId, email, role) => {
  return jwt.sign({ id: userId, email, role }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

export const generateRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '30d' });
};

export const hashPassword = async (password) => {
  return bcrypt.hash(password, 12);
};

export const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

export const generateOrderNumber = () => {
  const prefix = 'CB';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = uuidv4().slice(0, 4).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

export const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

export const slugify = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export const calculateDiscount = (price, discountPercent) => {
  return Math.round(price * (1 - discountPercent / 100) * 100) / 100;
};

export const isStrongPassword = (password) => {
  const minLen = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  return { valid: minLen && hasUpper && hasLower && hasNumber && hasSpecial, checks: { minLen, hasUpper, hasLower, hasNumber, hasSpecial } };
};

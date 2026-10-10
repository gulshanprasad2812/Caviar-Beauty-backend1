import { prisma } from '../db.js';
import { AppError } from '../middleware/errorHandler.js';
import { Prisma } from '@prisma/client';

export const validateCoupon = async (req, res, next) => {
  try {
    const { code, subtotal } = req.body;
    const coupon = await prisma.coupon.findUnique({ where: { code: code?.toUpperCase() } });
    if (!coupon || !coupon.isActive) throw new AppError(400, 'Invalid coupon');
    if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new AppError(400, 'Coupon expired');
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw new AppError(400, 'Coupon usage limit reached');
    const sub = new Prisma.Decimal(subtotal || 0);
    if (coupon.minOrder != null && sub.lessThan(coupon.minOrder)) throw new AppError(400, `Minimum order of ₹${coupon.minOrder} required`);

    let discount;
    if (coupon.discountType === 'percentage') {
      discount = sub.times(coupon.discountValue).div(100);
      if (coupon.maxDiscount != null && discount.greaterThan(coupon.maxDiscount)) discount = coupon.maxDiscount;
    } else {
      discount = coupon.discountValue;
    }

    res.json({ valid: true, coupon, discount });
  } catch (err) { next(err); }
};

export const getCoupons = async (_req, res, next) => {
  try { const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } }); res.json({ coupons }); }
  catch (err) { next(err); }
};

export const createCoupon = async (req, res, next) => {
  try {
    const { code, discountType, discountValue, minOrder, maxDiscount, usageLimit, expiresAt, description, isActive } = req.body;
    if (!code || !discountType || discountValue === undefined) throw new AppError(400, 'Code, type and value are required');
    if (!['percentage', 'fixed'].includes(discountType)) throw new AppError(400, 'discountType must be percentage or fixed');
    const value = parseFloat(discountValue);
    if (!isFinite(value) || value <= 0) throw new AppError(400, 'Discount value must be a positive number');
    if (discountType === 'percentage' && value > 100) throw new AppError(400, 'Percentage discount cannot exceed 100');
    const min = minOrder === undefined || minOrder === null || minOrder === '' ? null : parseFloat(minOrder);
    if (min !== null && (!isFinite(min) || min < 0)) throw new AppError(400, 'minOrder must be zero or a positive number');
    const coupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase(),
        discountType,
        discountValue: value,
        minOrder: min,
        maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null,
        usageLimit: usageLimit ? parseInt(usageLimit) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        description: description || null,
        isActive: isActive !== false,
      },
    });
    res.status(201).json(coupon);
  } catch (err) { next(err); }
};

export const updateCoupon = async (req, res, next) => {
  try {
    const { code, discountType, discountValue, minOrder, maxDiscount, usageLimit, expiresAt, description, isActive } = req.body;
    if (discountType && !['percentage', 'fixed'].includes(discountType)) throw new AppError(400, 'discountType must be percentage or fixed');
    if (discountValue !== undefined) {
      const value = parseFloat(discountValue);
      if (!isFinite(value) || value <= 0) throw new AppError(400, 'Discount value must be a positive number');
      if (discountType === 'percentage' && value > 100) throw new AppError(400, 'Percentage discount cannot exceed 100');
    }
    if (minOrder !== undefined && minOrder !== null && minOrder !== '') {
      const min = parseFloat(minOrder);
      if (!isFinite(min) || min < 0) throw new AppError(400, 'minOrder must be zero or a positive number');
    }
    const coupon = await prisma.coupon.update({
      where: { id: req.params.id },
      data: {
        ...(code && { code: code.toUpperCase() }),
        ...(discountType && { discountType }),
        ...(discountValue !== undefined && { discountValue: parseFloat(discountValue) }),
        ...(minOrder !== undefined && { minOrder: minOrder ? parseFloat(minOrder) : null }),
        ...(maxDiscount !== undefined && { maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null }),
        ...(usageLimit !== undefined && { usageLimit: usageLimit ? parseInt(usageLimit) : null }),
        ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    res.json(coupon);
  } catch (err) { next(err); }
};

export const deleteCoupon = async (req, res, next) => {
  try {
    await prisma.coupon.delete({ where: { id: req.params.id } });
    res.json({ message: 'Coupon deleted' });
  } catch (err) { next(err); }
};

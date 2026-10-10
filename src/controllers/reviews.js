import { prisma } from '../db.js';
import { AppError } from '../middleware/errorHandler.js';

export const createReview = async (req, res, next) => {
  try {
    const { productId, rating, title, comment } = req.body;
    if (!productId || !rating) throw new AppError(400, 'Product and rating are required');
    if (rating < 1 || rating > 5) throw new AppError(400, 'Rating must be between 1 and 5');

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new AppError(404, 'Product not found');

    const existing = await prisma.review.findUnique({ where: { userId_productId: { userId: req.user.id, productId } } });
    if (existing) throw new AppError(400, 'You have already reviewed this product');

    const purchased = await prisma.orderItem.findFirst({
      where: { productId, order: { userId: req.user.id, status: { not: 'CANCELLED' } } },
    });

    const review = await prisma.review.create({
      data: {
        productId,
        userId: req.user.id,
        rating: Math.round(rating),
        title: title || null,
        comment: comment || null,
        isVerified: Boolean(purchased),
        isActive: true,
      },
      include: { user: { select: { firstName: true, lastName: true, avatar: true } } },
    });
    res.status(201).json(review);
  } catch (err) { next(err); }
};

export const getProductReviews = async (req, res, next) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { productId: req.params.productId, isActive: true },
      include: { user: { select: { firstName: true, lastName: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ reviews });
  } catch (err) { next(err); }
};

export const listAllReviews = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const where = {};
    if (status === 'active') where.isActive = true;
    if (status === 'inactive') where.isActive = false;

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          product: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.review.count({ where }),
    ]);
    res.json({ reviews, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) { next(err); }
};

export const deleteReview = async (req, res, next) => {
  try {
    const review = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!review) throw new AppError(404, 'Review not found');
    if (review.userId !== req.user.id && req.user.role !== 'ADMIN') throw new AppError(403, 'Access denied');
    await prisma.review.delete({ where: { id: review.id } });
    res.json({ message: 'Review deleted' });
  } catch (err) { next(err); }
};

export const toggleReviewActive = async (req, res, next) => {
  try {
    const review = await prisma.review.update({
      where: { id: req.params.id },
      data: { isActive: req.body.isActive !== undefined ? req.body.isActive : true },
    });
    res.json(review);
  } catch (err) { next(err); }
};

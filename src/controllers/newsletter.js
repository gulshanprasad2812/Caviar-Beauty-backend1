import { prisma } from '../db.js';
import { AppError } from '../middleware/errorHandler.js';

export const subscribe = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(400, 'Valid email required');
    const existing = await prisma.newsletter.findUnique({ where: { email } });
    if (existing) return res.json({ message: 'Already subscribed' });
    await prisma.newsletter.create({ data: { email } });
    res.status(201).json({ message: 'Subscribed successfully' });
  } catch (err) { next(err); }
};

export const getSubscribers = async (req, res, next) => {
  try {
    const { page = '1', limit = '50' } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const [subscribers, total] = await Promise.all([
      prisma.newsletter.findMany({ orderBy: { createdAt: 'desc' }, skip: (pageNum - 1) * limitNum, take: limitNum }),
      prisma.newsletter.count(),
    ]);
    res.json({ subscribers, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err) { next(err); }
};

export const unsubscribe = async (req, res, next) => {
  try {
    const { email } = req.body;
    await prisma.newsletter.deleteMany({ where: { email } });
    res.json({ message: 'Unsubscribed' });
  } catch (err) { next(err); }
};

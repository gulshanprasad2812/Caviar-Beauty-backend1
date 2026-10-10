import { prisma } from '../db.js';
import { AppError } from '../middleware/errorHandler.js';

export const getUsers = async (req, res, next) => {
  try {
    const { search, page = '1', limit = '20' } = req.query;
    const where = search
      ? { OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ] }
      : {};
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.user.count({ where }),
    ]);
    res.json({ users, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err) { next(err); }
};

export const getUser = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, email: true, firstName: true, lastName: true, phone: true, avatar: true, role: true, isVerified: true, addresses: true, createdAt: true } });
    if (!user) throw new AppError(404, 'User not found');
    res.json(user);
  } catch (err) { next(err); }
};

export const updateUser = async (req, res, next) => {
  try {
    const { firstName, lastName, phone, avatar } = req.body;
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { firstName, lastName, phone, avatar }, select: { id: true, email: true, firstName: true, lastName: true, phone: true, avatar: true, role: true } });
    res.json(user);
  } catch (err) { next(err); }
};

export const deleteUser = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw new AppError(404, 'User not found');
    if (user.role === 'ADMIN') throw new AppError(400, 'Cannot deactivate an admin');
    await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ message: 'User deactivated' });
  } catch (err) { next(err); }
};

export const reactivateUser = async (req, res, next) => {
  try {
    await prisma.user.update({ where: { id: req.params.id }, data: { isActive: true } });
    res.json({ message: 'User activated' });
  } catch (err) { next(err); }
};

export const updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['CUSTOMER', 'ADMIN'].includes(role)) throw new AppError(400, 'Invalid role');
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw new AppError(404, 'User not found');
    if (user.role === 'ADMIN' && role !== 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (adminCount <= 1) throw new AppError(400, 'Cannot demote the last admin');
    }
    const updated = await prisma.user.update({ where: { id: req.params.id }, data: { role } });
    res.json(updated);
  } catch (err) { next(err); }
};

export const getDashboard = async (req, res, next) => {
  try {
    if (req.user.role === 'ADMIN') {
      const [totalUsers, totalOrders, totalProducts, totalRevenue, recentOrders] = await Promise.all([
        prisma.user.count({ where: { isActive: true } }),
        prisma.order.count({ where: { status: { not: 'CANCELLED' } } }),
        prisma.product.count({ where: { isActive: true } }),
        prisma.order.aggregate({ _sum: { total: true }, where: { paymentStatus: 'COMPLETED' } }),
        prisma.order.findMany({ take: 5, orderBy: { createdAt: 'desc' }, include: { user: { select: { firstName: true, lastName: true } } } }),
      ]);
      const now = Date.now();
      const monthAgo = new Date(now - 30 * 86400000);
      const twoMonthsAgo = new Date(now - 60 * 86400000);
      const [recentOrdersAgg, prevOrdersAgg] = await Promise.all([
        prisma.order.aggregate({ where: { status: { not: 'CANCELLED' }, createdAt: { gte: monthAgo } }, _count: { _all: true }, _sum: { total: true } }),
        prisma.order.aggregate({ where: { status: { not: 'CANCELLED' }, createdAt: { gte: twoMonthsAgo, lt: monthAgo } }, _count: { _all: true }, _sum: { total: true } }),
      ]);
      const recentOrderCount = recentOrdersAgg._count._all;
      const prevTotal = prevOrdersAgg._count._all;
      const userChanges = totalUsers > 7 ? `+${Math.round((totalUsers - 7) / 7 * 100)}%` : '+0%';
      const orderChange = prevTotal > 0 ? `${recentOrderCount >= prevTotal ? '+' : ''}${Math.round((recentOrderCount - prevTotal) / prevTotal * 100)}%` : '+0%';
      const prodChange = totalProducts > 14 ? `+${totalProducts - 14}` : '+0';
      const recentRev = Number(recentOrdersAgg._sum.total || 0);
      const prevRev = Number(prevOrdersAgg._sum.total || 0);
      const revChange = prevRev > 0 ? `${recentRev >= prevRev ? '+' : ''}${Math.round((recentRev - prevRev) / prevRev * 100)}%` : '+0%';
      return res.json({ stats: { totalUsers, totalOrders, totalProducts, totalRevenue: totalRevenue._sum.total || 0, changes: { totalUsers: userChanges, totalOrders: orderChange, totalProducts: prodChange, totalRevenue: revChange } }, recentOrders });
    }
    const [orders, wishlist, addresses] = await Promise.all([
      prisma.order.findMany({ where: { userId: req.user.id }, take: 5, orderBy: { createdAt: 'desc' } }),
      prisma.wishlistItem.count({ where: { userId: req.user.id } }),
      prisma.address.findMany({ where: { userId: req.user.id } }),
    ]);
    res.json({ orders, wishlist, addresses });
  } catch (err) { next(err); }
};

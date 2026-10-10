import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';

export const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: decoded.id }, select: { id: true, email: true, role: true, isActive: true } });
    if (!user || !user.isActive) return res.status(401).json({ error: 'User not found or inactive' });

    req.user = user;
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
};

export const authorize = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return _res.status(403).json({ error: 'Insufficient permissions' });
  next();
};

export const requireOwnUserOrAdmin = (req, _res, next) => {
  if (!req.user) return _res.status(401).json({ error: 'Authentication required' });
  if (req.user.role === 'ADMIN' || req.user.id === req.params.id) return next();
  return _res.status(403).json({ error: 'Access denied' });
};

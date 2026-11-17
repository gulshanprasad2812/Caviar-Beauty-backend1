import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';

export const authenticate = async (req, res, next) => {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Database failures must not masquerade as an invalid session: passing them
  // to the error handler returns 500 and keeps auth errors honest.
  try {
    const user = await prisma.user.findUnique({ where: { id: decoded.id }, select: { id: true, email: true, role: true, isActive: true } });
    if (!user || !user.isActive) return res.status(401).json({ error: 'User not found or inactive' });
    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
};

// Populates req.user when a valid session is present, but never rejects.
// Used by public reads that return extra data to admins (e.g. inactive products).
export const optionalAuth = async (req, _res, next) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: decoded.id }, select: { id: true, email: true, role: true, isActive: true } });
    if (user?.isActive) req.user = user;
  } catch {
    // Ignore invalid/expired tokens: the request continues as anonymous.
  }
  next();
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

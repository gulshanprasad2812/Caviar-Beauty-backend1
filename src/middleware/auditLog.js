import { prisma } from '../db.js';

const SENSITIVE_ACTIONS = new Set([
  'POST /api/auth/login',
  'POST /api/auth/admin-login',
  'POST /api/auth/register',
  'POST /api/auth/reset-password',
  'POST /api/auth/change-password',
  'POST /api/auth/forgot-password',
  'POST /api/auth/resend-otp',
  'POST /api/auth/verify-otp',
  'POST /api/auth/refresh-token',
]);

export const auditLog = async (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (req.method !== 'GET') {
      const userId = req.user?.id || null;
      const action = `${req.method} ${req.baseUrl}${req.path}`;
      const metadata = SENSITIVE_ACTIONS.has(action)
        ? JSON.stringify({ status: res.statusCode })
        : JSON.stringify({
            status: res.statusCode,
            id: req.body?.id || req.body?.orderId || req.body?.productId || null,
          }).slice(0, 500);
      prisma.log.create({
        data: { action, entity: req.params.id || null, userId, ip: req.ip, metadata },
      }).catch(() => {});
    }
    return originalJson(body);
  };
  next();
};

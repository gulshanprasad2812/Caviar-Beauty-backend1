import crypto from 'crypto';

export const CSRF_COOKIE = 'csrfToken';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export const setCsrfToken = (req, res, next) => {
  const token = req.cookies?.[CSRF_COOKIE] || crypto.randomBytes(32).toString('hex');
  if (!req.cookies?.[CSRF_COOKIE]) {
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
  res.setHeader('X-CSRF-Token', token);
  next();
};

export const csrfProtect = (req, res, next) => {
  if (safeMethods.has(req.method)) return next();
  if (req.headers.authorization?.startsWith('Bearer ')) return next();
  if (!req.cookies?.token) return next();

  const token = req.cookies[CSRF_COOKIE];
  const header = req.get('x-csrf-token');
  if (token && header && header === token) return next();
  return res.status(403).json({ error: 'CSRF token validation failed' });
};

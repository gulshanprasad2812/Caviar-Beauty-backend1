import crypto from 'crypto';
import { isPublicCacheableGet } from '../utils/cache.js';

export const CSRF_COOKIE = 'csrfToken';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export const setCsrfToken = (req, res, next) => {
  // Public GETs are cached at the edge and shared between visitors, so they
  // must not carry a cookie or a token header: a cached token would not match
  // the visitor's own cookie. Browsers get their token from the login response
  // (or from the first POST), and CSRF is not enforced without an auth cookie.
  if (isPublicCacheableGet(req)) return next();

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
  // Paytm posts the browser callback and server-to-server webhook directly to
  // the API. They are authenticated by the Paytm checksum, not by a CSRF token.
  // Dummy QR endpoints are authenticated by the unguessable session token.
  if (/^\/payments\/callback\/?$/.test(req.path) || /^\/payments\/webhook\//.test(req.path)) return next();
  if (/^\/payments\/session\//.test(req.path)) return next();
  if (!req.cookies?.token) return next();

  const token = req.cookies[CSRF_COOKIE];
  const header = req.get('x-csrf-token');
  if (token && header && header === token) return next();
  return res.status(403).json({ error: 'CSRF token validation failed' });
};

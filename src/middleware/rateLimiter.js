import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const storeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
    return email || req.ip;
  },
  message: { error: 'Too many attempts for this email, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// SMS costs money per message, so phone OTP requests are limited per account
// (falling back to the number, then the IP, for unauthenticated calls).
export const phoneLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => {
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.replace(/\D/g, '') : '';
    return req.user?.id || phone || req.ip;
  },
  message: { error: 'Too many verification codes requested for this number, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import categoryRoutes from './routes/categories.js';
import brandRoutes from './routes/brands.js';
import orderRoutes from './routes/orders.js';
import cartRoutes from './routes/cart.js';
import wishlistRoutes from './routes/wishlist.js';
import userRoutes from './routes/users.js';
import couponRoutes from './routes/coupons.js';
import addressRoutes from './routes/addresses.js';
import paymentRoutes from './routes/payments.js';
import uploadRoutes from './routes/upload.js';
import reviewRoutes from './routes/reviews.js';
import newsletterRoutes from './routes/newsletter.js';
import contactRoutes from './routes/contact.js';
import catalogRoutes from './routes/catalog.js';
import shipmentRoutes from './routes/shipments.js';
import invoiceRoutes from './routes/invoice.js';
import cronRoutes from './routes/cron.js';
import { errorHandler } from './middleware/errorHandler.js';
import { auditLog } from './middleware/auditLog.js';
import { setCsrfToken, csrfProtect } from './middleware/csrf.js';
import { prisma } from './db.js';
import { Prisma } from '@prisma/client';

const app = express();
const isProd = process.env.NODE_ENV === 'production';

const normalizeOrigin = (value) => {
  if (!value?.trim()) return null;
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
};

const allowedFrontendOrigins = new Set(
  [process.env.FRONTEND_URL, ...(process.env.FRONTEND_URLS || '').split(',')]
    .map(normalizeOrigin)
    .filter(Boolean)
);

if (isProd) app.set('trust proxy', 1);

const supabaseUrl = process.env.SUPABASE_URL || '';

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'", 'https://checkout.razorpay.com', 'https://accounts.google.com'],
      'frame-src': ["'self'", 'https://checkout.razorpay.com', 'https://accounts.google.com'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'img-src': ["'self'", 'data:', 'blob:', 'https:'],
      'connect-src': ["'self'", 'https://checkout.razorpay.com', 'https://api.razorpay.com', 'https://accounts.google.com', supabaseUrl].filter(Boolean),
    },
  },
}));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedFrontendOrigins.has(normalizeOrigin(origin))) callback(null, true);
    else if (!allowedFrontendOrigins.size && !isProd) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  exposedHeaders: ['X-CSRF-Token'],
}));
app.use(compression());
app.use(express.json({ limit: '10mb', verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); } }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(isProd ? 'combined' : 'dev'));
app.use(setCsrfToken);
app.use('/api', csrfProtect);
app.use('/api', auditLog);

const decimalToNumber = (value) => {
  if (value instanceof Prisma.Decimal) return value.toNumber();
  if (Array.isArray(value)) return value.map(decimalToNumber);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) out[key] = decimalToNumber(value[key]);
    return out;
  }
  return value;
};

app.use((_req, res, next) => {
  const original = res.json.bind(res);
  res.json = (body) => original(decimalToNumber(body));
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/users', userRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api', invoiceRoutes);
app.use('/api/cron', cronRoutes);

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'up', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'down', timestamp: new Date().toISOString() });
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(errorHandler);

export default app;

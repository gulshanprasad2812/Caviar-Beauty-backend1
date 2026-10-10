import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

export const errorHandler = (err, _req, res, _next) => {
  console.error('Error:', err);

  if (err?.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: err.errors });
  }

  if (err?.code === 'P2002') return res.status(409).json({ error: 'Resource already exists' });
  if (err?.code === 'P2025') return res.status(404).json({ error: 'Resource not found' });

  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON in request body' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
  if (err?.statusCode && err?.statusCode >= 400 && err?.statusCode < 500) {
    return res.status(err.statusCode).json({ error: err.message || 'Bad request' });
  }

  return res.status(500).json({ error: 'Internal server error' });
};

/**
 * Edge-cache policy for the API.
 *
 * Every response is private by default (`no-store`), which is what the auth,
 * cart, order and admin routes need. Only the fully public, per-reader-identical
 * storefront endpoints listed below are marked as cacheable at the CDN. That
 * keeps the shared Vercel cache from ever holding a signed-in user's data.
 *
 * Endpoints that behave differently for an admin (for example
 * `/api/products/:slug` and `/api/content/pages/:slug`, which return unpublished
 * rows to admins) are deliberately absent from this list.
 *
 * The query string is part of the CDN cache key, so filtered lists cache per URL.
 */
const PUBLIC_CACHE_PATTERNS = [
  /^\/api\/site$/,
  /^\/api\/products$/,
  /^\/api\/products\/(featured|new-arrivals|best-sellers)$/,
  /^\/api\/categories$/,
  /^\/api\/categories\/[^/]+$/,
  /^\/api\/brands$/,
  /^\/api\/catalog\/tags$/,
  /^\/api\/catalog\/collections$/,
  /^\/api\/catalog\/collections\/[^/]+$/,
  /^\/api\/reviews\/product\/[^/]+$/,
  /^\/api\/content\/pages$/,
];

// Short enough that an admin edit shows up in about a minute, long enough that
// anonymous traffic is served from the edge instead of hitting the functions.
const PUBLIC_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';

export const isPublicCacheableGet = (req) => (
  req.method === 'GET' && PUBLIC_CACHE_PATTERNS.some((pattern) => pattern.test(req.path))
);

/**
 * Sets the CDN policy for this response. Runs before the routes so a handler
 * never has to remember it. Mounted after the `/uploads` handlers, which set
 * their own immutable caching.
 */
export const applyCachePolicy = (req, res, next) => {
  res.setHeader('Cache-Control', isPublicCacheableGet(req) ? PUBLIC_CACHE_CONTROL : 'no-store');
  next();
};
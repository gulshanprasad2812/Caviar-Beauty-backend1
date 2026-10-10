import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { prisma } from '../src/db.js';

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: ['user@test.com', 'new@test.com', 'weak@test.com'] } } });
  await prisma.productImage.deleteMany({ where: { product: { slug: 'test-product' } } });
  await prisma.productTag.deleteMany({ where: { product: { slug: 'test-product' } } });
  await prisma.collectionProduct.deleteMany({ where: { product: { slug: 'test-product' } } });
  await prisma.product.deleteMany({ where: { slug: 'test-product' } });
  await prisma.category.deleteMany({ where: { slug: 'test-category' } });
  await prisma.brand.deleteMany({ where: { slug: 'test-brand' } });

  await prisma.brand.create({ data: { name: 'Test Brand', slug: 'test-brand' } });
  const category = await prisma.category.create({ data: { name: 'Test Category', slug: 'test-category' } });
  const brand = await prisma.brand.findUniqueOrThrow({ where: { slug: 'test-brand' } });

  await prisma.product.create({
    data: {
      name: 'Test Product',
      slug: 'test-product',
      description: 'A product for tests',
      brandId: brand.id,
      categoryId: category.id,
      basePrice: 1000,
      currency: 'INR',
      isActive: true,
      images: { create: { url: '/images/test-product.jpg', isPrimary: true, sortOrder: 0 } },
      variants: { create: { color: 'Black', size: 'M', stock: 10, sku: 'TP-BLACK-M' } },
      inventory: { create: { quantity: 10 } },
    },
  });

  const hash = await bcrypt.hash('TestPass123!', 10);
  await prisma.user.create({
    data: { email: 'user@test.com', password: hash, firstName: 'Test', lastName: 'User', isVerified: true },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: ['user@test.com', 'new@test.com', 'weak@test.com'] } } });
  await prisma.productImage.deleteMany({ where: { product: { slug: 'test-product' } } });
  await prisma.product.deleteMany({ where: { slug: 'test-product' } });
  await prisma.category.deleteMany({ where: { slug: 'test-category' } });
  await prisma.brand.deleteMany({ where: { slug: 'test-brand' } });
  await prisma.$disconnect();
});

describe('health', () => {
  it('reports ok with database up', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('up');
  });
});

describe('products', () => {
  it('lists active products', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(res.body.products.length).toBeGreaterThan(0);
    expect(res.body.products[0]).toHaveProperty('slug');
  });

  it('returns a product by slug', async () => {
    const res = await request(app).get('/api/products/test-product');
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('test-product');
  });
});

describe('auth', () => {
  it('rejects a weak password on register', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'weak@test.com',
      password: 'weak',
      firstName: 'Weak',
      lastName: 'Pass',
    });
    expect(res.status).toBe(400);
  });

  it('registers a new user', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'new@test.com',
      password: 'StrongPass1!',
      firstName: 'New',
      lastName: 'User',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('new@test.com');
  });

  it('logs in with valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'new@test.com',
      password: 'StrongPass1!',
    });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('new@test.com');
  });
});

describe('CSRF protection', () => {
  it('blocks cookie-authenticated mutations without a CSRF token and allows them with one', async () => {
    const agent = request.agent(app);

    const health = await agent.get('/api/health');
    const cookies = health.headers['set-cookie'] || [];
    const csrfCookie = cookies.find((c) => c.startsWith('csrfToken='));
    expect(csrfCookie).toBeTruthy();
    const csrfValue = csrfCookie.split(';')[0].split('=')[1];

    const login = await agent.post('/api/auth/login').send({ email: 'user@test.com', password: 'TestPass123!' });
    expect(login.status).toBe(200);

    const blocked = await agent.post('/api/auth/logout');
    expect(blocked.status).toBe(403);

    const allowed = await agent.post('/api/auth/logout').set('X-CSRF-Token', csrfValue);
    expect(allowed.status).toBe(200);
  });
});

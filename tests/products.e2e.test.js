/**
 * Public-read rules for soft-deleted products.
 *
 * A product deletion is a deactivation: the row must stay for order history but
 * must disappear from the storefront, while an admin can still load it.
 *
 * Needs a database and only runs when explicitly enabled:
 *   PRODUCT_E2E=1 npx vitest run --config vitest.e2e.config.js tests/products.e2e.test.js
 */
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import request from 'supertest';

import app from '../src/app.js';
import { prisma } from '../src/db.js';

const ENABLED = process.env.PRODUCT_E2E === '1' || process.env.npm_lifecycle_event === 'test:products:e2e';

describe.runIf(ENABLED)('product soft delete visibility', () => {
  const slug = `soft-delete-${crypto.randomUUID()}`;
  let token = '';
  let productId = '';
  let categoryId = '';
  let brandId = '';

  beforeAll(async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@caviarbeauty.com', password: 'admin123' });
    expect(login.status).toBe(200);
    token = login.body.token;
    expect(token).toBeTruthy();

    const category = await prisma.category.findFirst();
    const brand = await prisma.brand.findFirst();
    expect(category).toBeTruthy();
    expect(brand).toBeTruthy();
    categoryId = category.id;
    brandId = brand.id;
  });

  afterAll(async () => {
    if (productId) {
      await prisma.productVariant.deleteMany({ where: { productId } });
      await prisma.productImage.deleteMany({ where: { productId } });
      await prisma.inventory.deleteMany({ where: { productId } });
      await prisma.product.deleteMany({ where: { id: productId } });
    }
    await prisma.$disconnect();
  });

  it('serves an active product to anonymous readers', async () => {
    const created = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Soft Delete Probe',
        slug,
        description: 'Regression probe for soft-delete visibility.',
        brandId,
        categoryId,
        basePrice: 1500,
        variants: [{ color: 'Black', size: 'M', stock: 2 }],
      });

    expect(created.status).toBe(201);
    productId = created.body.id;

    const anon = await request(app).get(`/api/products/${slug}`);
    expect(anon.status).toBe(200);
    expect(anon.body.slug).toBe(slug);
  });

  it('hides the product from anonymous readers once deactivated', async () => {
    const deleted = await request(app)
      .delete(`/api/products/${productId}`)
      .set('Authorization', `Bearer ${token}`);
    expect([200, 204]).toContain(deleted.status);

    const row = await prisma.product.findUnique({ where: { id: productId } });
    expect(row.isActive).toBe(false);

    const anon = await request(app).get(`/api/products/${slug}`);
    expect(anon.status).toBe(404);
  });

  it('still lets an admin load the deactivated product', async () => {
    const admin = await request(app)
      .get(`/api/products/${slug}`)
      .set('Authorization', `Bearer ${token}`);
    expect(admin.status).toBe(200);
    expect(admin.body.isActive).toBe(false);
  });
});

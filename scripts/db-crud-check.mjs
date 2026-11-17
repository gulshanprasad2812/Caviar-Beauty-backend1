import 'dotenv/config';
import request from 'supertest';

import app from '../src/app.js';
import { prisma } from '../src/db.js';

const results = [];
const mark = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
};

const ADMIN = { email: 'admin@caviarbeauty.com', password: 'admin123' };
const slug = `dbcheck-${Date.now()}`;

async function main() {
  // ---------------------------------------------------------------- 1. connectivity
  const t0 = Date.now();
  const ping = await prisma.$queryRaw`SELECT 1 AS ok`;
  const ms = Date.now() - t0;
  mark('database reachable', ping?.[0]?.ok === 1, `SELECT 1 in ${ms} ms`);

  const version = await prisma.$queryRaw`SELECT version() AS v`;
  mark('postgres version', true, String(version[0].v).split(',')[0]);

  const counts = {
    users: await prisma.user.count(),
    products: await prisma.product.count(),
    activeProducts: await prisma.product.count({ where: { isActive: true } }),
    categories: await prisma.category.count(),
    brands: await prisma.brand.count(),
    orders: await prisma.order.count(),
    payments: await prisma.payment.count(),
    coupons: await prisma.coupon.count(),
  };
  mark('read row counts', true, JSON.stringify(counts));

  // ---------------------------------------------------------------- 2. prisma CRUD, rolled back
  const cat = await prisma.category.findFirst();
  const brand = await prisma.brand.findFirst();
  if (!cat || !brand) throw new Error('seed data missing: category/brand');

  let rolledBack = false;
  try {
    await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          name: 'Rollback Probe', slug: `${slug}-tx`, basePrice: 1000,
          description: 'Transaction probe, never committed.',
          categoryId: cat.id, brandId: brand.id,
          inventory: { create: { quantity: 3, lowStockThreshold: 1 } },
        },
      });
      const u = await tx.product.update({ where: { id: p.id }, data: { name: 'Rollback Probe v2' } });
      if (u.name !== 'Rollback Probe v2') throw new Error('update did not apply inside transaction');
      await tx.product.delete({ where: { id: p.id } });
      throw new Error('__rollback__');
    });
  } catch (err) {
    rolledBack = err.message === '__rollback__';
  }
  const residue = await prisma.product.count({ where: { slug: `${slug}-tx` } });
  mark('prisma create/update/delete in transaction', rolledBack && residue === 0,
    `rolled back, ${residue} residual row(s)`);

  // ---------------------------------------------------------------- 3. HTTP auth
  const login = await request(app).post('/api/auth/login').send(ADMIN);
  const token = login.body?.token;
  mark('admin login', login.status === 200 && !!token && login.body?.user?.role === 'ADMIN',
    `HTTP ${login.status}, role ${login.body?.user?.role}`);
  const auth = (r) => r.set('Authorization', `Bearer ${token}`);

  // ---------------------------------------------------------------- 4. read via API
  const list = await request(app).get('/api/products?limit=3');
  mark('GET /api/products', list.status === 200 && Array.isArray(list.body.products),
    `HTTP ${list.status}, ${list.body?.products?.length} items, total ${list.body?.total}`);

  const adminList = await auth(request(app).get('/api/products/admin/all'));
  mark('GET /api/products/admin/all (auth)', adminList.status === 200,
    `HTTP ${adminList.status}, ${adminList.body?.length ?? adminList.body?.products?.length} rows`);

  // ---------------------------------------------------------------- 5. create
  const created = await auth(request(app).post('/api/products')).send({
    name: 'DB Check Bag', slug, description: 'Created by the automated CRUD check.',
    brandId: brand.id, categoryId: cat.id, basePrice: 2500, discountPrice: 1999,
    material: 'Test leather', specifications: { closure: 'zip' },
    images: [{ url: 'https://example.com/a.png' }, { url: 'https://example.com/b.png' }],
    variants: [{ color: 'Black', size: 'M', stock: 4 }, { color: 'Ivory', size: 'M', stock: 2 }],
  });
  const product = created.body;
  mark('POST /api/products (create)', created.status === 201 && !!product?.id,
    `HTTP ${created.status}, sku ${product?.sku}`);

  // ---------------------------------------------------------------- 6. read back
  const readBack = await request(app).get(`/api/products/${slug}`);
  mark('GET /api/products/:slug', readBack.status === 200 && readBack.body?.name === 'DB Check Bag',
    `HTTP ${readBack.status}, ${readBack.body?.variants?.length} variants, inventory ${readBack.body?.inventory?.quantity}`);
  const inv = await prisma.inventory.findUnique({ where: { productId: product.id } });
  mark('nested inventory row', inv?.quantity === 6, `quantity ${inv?.quantity} (expected 6)`);

  // ---------------------------------------------------------------- 7. update
  const updated = await auth(request(app).put(`/api/products/${product.id}`)).send({
    name: 'DB Check Bag (updated)', basePrice: 3000, discountPrice: 2100,
    variants: [{ color: 'Black', size: 'M', stock: 9 }],
  });
  const fresh = await prisma.product.findUnique({ where: { id: product.id }, include: { variants: true } });
  mark('PUT /api/products/:id (update)',
    updated.status === 200 && fresh?.name === 'DB Check Bag (updated)' && Number(fresh?.basePrice) === 3000,
    `HTTP ${updated.status}, name "${fresh?.name}", price ${fresh?.basePrice}`);

  // ---------------------------------------------------------------- 8. search
  const search = await request(app).get('/api/products?search=DB Check Bag');
  mark('search finds the new row', search.status === 200 && search.body.products.some((p) => p.id === product.id),
    `${search.body?.products?.length} hit(s)`);

  // ---------------------------------------------------------------- 9. soft delete
  const del = await auth(request(app).delete(`/api/products/${product.id}`));
  const afterDelete = await prisma.product.findUnique({ where: { id: product.id } });
  const publicRead = await request(app).get(`/api/products/${slug}`);
  const adminRead = await auth(request(app).get(`/api/products/${slug}`));
  mark('DELETE /api/products/:id (soft delete)',
    (del.status === 200 || del.status === 204) && afterDelete?.isActive === false
      && publicRead.status === 404 && adminRead.status === 200,
    `HTTP ${del.status}, isActive ${afterDelete?.isActive}, public read ${publicRead.status}, admin read ${adminRead.status}`);

  // ---------------------------------------------------------------- 10. coupon CRUD
  const coupon = await auth(request(app).post('/api/coupons')).send({
    code: `DBCHECK${Date.now() % 100000}`, discountType: 'percentage', discountValue: 10,
    minOrder: 1000, maxDiscount: 500, usageLimit: 5,
  });
  const couponId = coupon.body?.id;
  mark('POST /api/coupons (create)', coupon.status === 201 && !!couponId, `HTTP ${coupon.status}`);

  const couponUp = await auth(request(app).put(`/api/coupons/${couponId}`)).send({ discountValue: 15, isActive: false });
  const couponRow = couponId ? await prisma.coupon.findUnique({ where: { id: couponId } }) : null;
  mark('PUT /api/coupons/:id (update)',
    couponUp.status === 200 && Number(couponRow?.discountValue) === 15 && couponRow?.isActive === false,
    `HTTP ${couponUp.status}, value ${couponRow?.discountValue}, active ${couponRow?.isActive}`);

  const couponDel = await auth(request(app).delete(`/api/coupons/${couponId}`));
  const couponGone = couponId ? await prisma.coupon.findUnique({ where: { id: couponId } }) : null;
  mark('DELETE /api/coupons/:id', (couponDel.status === 200 || couponDel.status === 204) && !couponGone,
    `HTTP ${couponDel.status}`);

  // ---------------------------------------------------------------- 11. storefront content
  const pages = await request(app).get('/api/content/pages');
  const builtInSlugs = ['about', 'faq', 'privacy-policy', 'terms-of-service', 'cookie-policy'];
  const publishedSlugs = new Set(pages.body?.pages?.map((p) => p.slug));
  mark('GET /api/content/pages', pages.status === 200 && builtInSlugs.every((s) => publishedSlugs.has(s)),
    `HTTP ${pages.status}, ${pages.body?.pages?.length} published page(s)`);

  const aboutPage = await request(app).get('/api/content/pages/about');
  const storyOk = Array.isArray(aboutPage.body?.data?.story) && aboutPage.body.data.story.length > 0;
  const stampOk = typeof aboutPage.body?.updatedAt === 'string'
    && !Number.isNaN(Date.parse(aboutPage.body.updatedAt));
  mark('GET /api/content/pages/about', aboutPage.status === 200 && aboutPage.body?.layout === 'about' && storyOk,
    `HTTP ${aboutPage.status}, ${aboutPage.body?.data?.story?.length} story paragraph(s)`);
  mark('timestamps serialise as ISO strings', stampOk, String(aboutPage.body?.updatedAt));

  const pageSlug = `${slug}-page`;
  const newPage = await auth(request(app).post('/api/content/pages')).send({
    slug: pageSlug,
    title: 'DB Check Page',
    subtitle: 'Temporary',
    seoTitle: 'DB Check Page',
    sections: [{ heading: 'Check', body: ['Created by the automated check.'], items: ['One bullet'] }],
  });
  const pageId = newPage.body?.id;
  mark('POST /api/content/pages (create)', newPage.status === 201 && !!pageId, `HTTP ${newPage.status}`);

  const pageUp = await auth(request(app).put(`/api/content/pages/${pageId}`)).send({ title: 'DB Check Page v2', isPublished: false });
  const hiddenRead = await request(app).get(`/api/content/pages/${pageSlug}`);
  mark('PUT /api/content/pages/:id (unpublish)',
    pageUp.status === 200 && pageUp.body?.title === 'DB Check Page v2' && hiddenRead.status === 404,
    `HTTP ${pageUp.status}, public read ${hiddenRead.status}`);

  const aboutRow = await prisma.contentPage.findUnique({ where: { slug: 'about' } });
  const builtInDelete = await auth(request(app).delete(`/api/content/pages/${aboutRow.id}`));
  mark('built-in page cannot be deleted', builtInDelete.status === 400, `HTTP ${builtInDelete.status}`);

  const pageDel = await auth(request(app).delete(`/api/content/pages/${pageId}`));
  const pageGone = await prisma.contentPage.count({ where: { slug: pageSlug } });
  mark('DELETE /api/content/pages/:id', (pageDel.status === 200 || pageDel.status === 204) && pageGone === 0,
    `HTTP ${pageDel.status}, ${pageGone} row(s) left`);

  const settings = await request(app).get('/api/site');
  const originalTagline = settings.body?.tagline ?? null;
  mark('GET /api/site', settings.status === 200 && !!settings.body?.brandName && settings.body?.updatedBy === undefined,
    `HTTP ${settings.status}, brand "${settings.body?.brandName}"`);

  const probeTagline = `DB check tagline ${Date.now()}`;
  const settingsUp = await auth(request(app).put('/api/site')).send({ tagline: probeTagline });
  const settingsRead = await request(app).get('/api/site');
  mark('PUT /api/site (update)', settingsUp.status === 200 && settingsRead.body?.tagline === probeTagline,
    `HTTP ${settingsUp.status}`);

  await prisma.siteSetting.update({ where: { id: 'default' }, data: { tagline: originalTagline } });
  const settingsRestored = await request(app).get('/api/site');
  mark('restore site settings', settingsRestored.body?.tagline === originalTagline, `tagline "${settingsRestored.body?.tagline}"`);

  // ---------------------------------------------------------------- 12. cleanup
  await prisma.$transaction([
    prisma.productVariant.deleteMany({ where: { productId: product.id } }),
    prisma.productImage.deleteMany({ where: { productId: product.id } }),
    prisma.inventory.deleteMany({ where: { productId: product.id } }),
    prisma.product.delete({ where: { id: product.id } }),
  ]);
  const leftover = await prisma.product.count({ where: { slug } });
  mark('cleanup test product', leftover === 0, `${leftover} row(s) left`);

  // ---------------------------------------------------------------- summary
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  if (passed !== results.length) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('\nFATAL:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
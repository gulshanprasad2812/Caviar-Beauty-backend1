/**
 * Admin-editable content: site settings and storefront pages.
 *
 * Needs a database and only runs when explicitly enabled:
 *   npm run test:content:e2e
 */
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import request from 'supertest';

import app from '../src/app.js';
import { prisma } from '../src/db.js';

const ENABLED = process.env.CONTENT_E2E === '1' || process.env.npm_lifecycle_event === 'test:content:e2e';

describe.runIf(ENABLED)('editable storefront content', () => {
  const slug = `e2e-page-${crypto.randomUUID().slice(0, 8)}`;
  let token = '';
  let pageId = '';
  let originalSettings = null;

  beforeAll(async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@caviarbeauty.com', password: 'admin123' });
    expect(login.status).toBe(200);
    token = login.body.token;
    originalSettings = (await request(app).get('/api/site')).body;
    expect(originalSettings.brandName).toBeTruthy();
  });

  afterAll(async () => {
    if (pageId) await prisma.contentPage.deleteMany({ where: { id: pageId } });
    if (originalSettings) {
      const { id, updatedAt, updatedBy, ...rest } = originalSettings;
      await prisma.siteSetting.update({ where: { id: 'default' }, data: rest });
    }
    await prisma.$disconnect();
  });

  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  it('seeds the default storefront pages', async () => {
    const res = await request(app).get('/api/content/pages');
    expect(res.status).toBe(200);
    const slugs = res.body.pages.map((page) => page.slug);
    for (const expected of ['about', 'privacy-policy', 'terms-of-service', 'cookie-policy', 'faq']) {
      expect(slugs).toContain(expected);
    }
  });

  it('serves the About page with its structured data', async () => {
    const res = await request(app).get('/api/content/pages/about');
    expect(res.status).toBe(200);
    expect(res.body.layout).toBe('about');
    expect(Array.isArray(res.body.data.story)).toBe(true);
    expect(res.body.data.story.length).toBeGreaterThan(0);
    expect(res.body.data.values.length).toBeGreaterThan(0);
  });

  it('serves site settings without leaking internals', async () => {
    const res = await request(app).get('/api/site');
    expect(res.status).toBe(200);
    expect(res.body.brandName).toBeTruthy();
    expect(res.body.updatedBy).toBeUndefined();
  });

  it('lets an admin update site settings', async () => {
    const nextTagline = `E2E tagline ${Date.now()}`;
    const res = await auth(request(app).put('/api/site')).send({ tagline: nextTagline });
    expect(res.status).toBe(200);
    expect(res.body.tagline).toBe(nextTagline);

    const publicRead = await request(app).get('/api/site');
    expect(publicRead.body.tagline).toBe(nextTagline);
  });

  it('rejects invalid settings and non-admin writes', async () => {
    const badEmail = await auth(request(app).put('/api/site')).send({ supportEmail: 'not-an-email' });
    expect(badEmail.status).toBe(400);

    const badUrl = await auth(request(app).put('/api/site')).send({ instagramUrl: 'javascript:alert(1)' });
    expect(badUrl.status).toBe(400);

    const anon = await request(app).put('/api/site').send({ tagline: 'nope' });
    expect([401, 403]).toContain(anon.status);
  });

  it('returns real ISO timestamps instead of empty objects', async () => {
    const res = await auth(request(app).get('/api/content/admin/pages'));
    expect(res.status).toBe(200);
    const stamp = res.body.pages[0]?.updatedAt;
    expect(typeof stamp).toBe('string');
    expect(Number.isNaN(Date.parse(stamp))).toBe(false);
  });

  it('creates, reads, updates and deletes a custom page', async () => {
    const created = await auth(request(app).post('/api/content/pages')).send({
      slug,
      title: 'E2E Policy',
      subtitle: 'Temporary',
      seoTitle: 'E2E Policy | Caviar Beauty',
      seoDesc: 'Created by the content end-to-end test.',
      sections: [
        { heading: 'First heading', body: ['Paragraph one.'], items: ['Bullet one.'] },
        { heading: 'Table heading', table: { columns: ['A', 'B'], rows: [['1', '2']] } },
      ],
    });
    expect(created.status).toBe(201);
    pageId = created.body.id;

    const publicRead = await request(app).get(`/api/content/pages/${slug}`);
    expect(publicRead.status).toBe(200);
    expect(publicRead.body.sections).toHaveLength(2);
    expect(publicRead.body.sections[1].table.columns).toEqual(['A', 'B']);

    const updated = await auth(request(app).put(`/api/content/pages/${pageId}`)).send({
      title: 'E2E Policy (updated)',
      isPublished: false,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe('E2E Policy (updated)');

    const hidden = await request(app).get(`/api/content/pages/${slug}`);
    expect(hidden.status).toBe(404);

    const adminRead = await auth(request(app).get(`/api/content/pages/${slug}`));
    expect(adminRead.status).toBe(200);
    expect(adminRead.body.isPublished).toBe(false);

    const deleted = await auth(request(app).delete(`/api/content/pages/${pageId}`));
    expect(deleted.status).toBe(200);
    pageId = '';

    const gone = await request(app).get(`/api/content/pages/${slug}`);
    expect(gone.status).toBe(404);
  });

  it('refuses duplicate slugs and protecting built-in pages', async () => {
    const duplicate = await auth(request(app).post('/api/content/pages')).send({ slug: 'about', title: 'Copy' });
    expect(duplicate.status).toBe(409);

    const about = await prisma.contentPage.findUnique({ where: { slug: 'about' } });
    const deleteBuiltIn = await auth(request(app).delete(`/api/content/pages/${about.id}`));
    expect(deleteBuiltIn.status).toBe(400);
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/db.js';

describe('API integration (health, errors, security)', () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('GET /api/health returns ok with db up', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('up');
  });

  it('unknown route returns JSON 404', async () => {
    const res = await request(app).get('/api/definitely-not-a-route');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });

  it('malformed JSON body returns 400, not 500', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"bad json":');
    expect([400, 404]).toContain(res.status);
  });

  it('sets CSRF cookie on first request', async () => {
    const res = await request(app).get('/api/health');
    const cookies = res.headers['set-cookie'] || [];
    expect(cookies.some((c) => c.startsWith('csrfToken='))).toBe(true);
    expect(res.headers['x-csrf-token']).toBeTruthy();
  });

  it('allows the configured frontend origin and exposes the CSRF response header', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', process.env.FRONTEND_URL);
    expect(res.headers['access-control-allow-origin']).toBe(process.env.FRONTEND_URL);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-expose-headers']).toContain('X-CSRF-Token');
  });

  it('rejects protected POST without auth', async () => {
    const res = await request(app).post('/api/addresses').send({});
    expect([401, 403]).toContain(res.status);
  });

  it('does not set X-Powered-By (helmet removes it)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

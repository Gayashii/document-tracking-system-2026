'use strict';

/**
 * Integration tests for auth routes.
 * Requires a real PostgreSQL database (doc_tracking_test).
 * Run: NODE_ENV=test npx knex migrate:latest && npm test
 */

const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/db');

beforeAll(async () => {
  await db.migrate.latest();
});

afterAll(async () => {
  await db.destroy();
});

beforeEach(async () => {
  await db('audit_logs').del();
  await db('document_phase_log').del();
  await db('document_status_history').del();
  await db('document_versions').del();
  await db('documents').del();
  await db('refresh_tokens').del();
  await db('password_reset_tokens').del();
  await db('users').del();
  await db('workflow_steps').del();
  await db('workflows').del();
  await db('document_types').del();
  await db('departments').del();
});

const validUser = {
  email: 'test@pgi.ac.lk',
  password: 'Password@123',
};

describe('POST /api/v1/auth/register', () => {
  it('registers a new user and returns 201', async () => {
    const res = await request(app).post('/api/v1/auth/register').send(validUser);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(validUser.email);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.password_hash).toBeUndefined();
  });

  it('returns 409 for duplicate email', async () => {
    await request(app).post('/api/v1/auth/register').send(validUser);
    const res = await request(app).post('/api/v1/auth/register').send(validUser);
    expect(res.status).toBe(409);
  });

  it('returns 400 for weak password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'a@b.com', password: 'weak' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/v1/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/v1/auth/register').send(validUser);
  });

  it('returns access token and sets refresh cookie', async () => {
    const res = await request(app).post('/api/v1/auth/login').send(validUser);
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, password: 'Wrong@123' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for unknown email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@x.com', password: 'Password@123' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('rotates refresh token and returns new access token', async () => {
    await request(app).post('/api/v1/auth/register').send(validUser);
    const loginRes = await request(app).post('/api/v1/auth/login').send(validUser);
    const cookie = loginRes.headers['set-cookie'][0];

    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('returns 401 with no cookie', async () => {
    const res = await request(app).post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('revokes refresh token so it cannot be reused', async () => {
    await request(app).post('/api/v1/auth/register').send(validUser);
    const loginRes = await request(app).post('/api/v1/auth/login').send(validUser);
    const cookie = loginRes.headers['set-cookie'][0];

    await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);

    const refreshRes = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(refreshRes.status).toBe(401);
  });
});

describe('POST /api/v1/auth/forgot-password', () => {
  it('always returns 200 regardless of whether email exists', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@x.com' });
    expect(res.status).toBe(200);
  });
});

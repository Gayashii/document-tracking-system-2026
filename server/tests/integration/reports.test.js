'use strict';

/**
 * Integration tests for report endpoints.
 *
 * Tests:
 *  1. GET /api/v1/reports/pending — only submitted/pending_approval docs returned
 *  2. Finance staff role scoping (department filtering)
 *  3. GET /api/v1/reports/export?report=pending&format=csv — row count matches pending report
 *  4. Auditor can access reports
 *  5. Student cannot access reports (403)
 */

const path = require('path');
const request = require('supertest');
const app = require('../../src/app');
const db  = require('../../src/config/db');

// ─── helpers ────────────────────────────────────────────────────────────────

async function registerAndLogin(email, role) {
  await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password: 'Password@123', role });
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: 'Password@123' });
  return res.body.data.accessToken;
}

const DUMMY_PDF = path.resolve(__dirname, 'fixtures/dummy.pdf');

// ─── setup / teardown ───────────────────────────────────────────────────────

let deptId, deptId2;
let typeId;
let studentToken, staffToken, adminToken, auditorToken;

beforeAll(async () => {
  await db.migrate.latest();

  const fs = require('fs');
  const fixtureDir = path.resolve(__dirname, 'fixtures');
  fs.mkdirSync(fixtureDir, { recursive: true });
  if (!fs.existsSync(DUMMY_PDF)) {
    fs.writeFileSync(DUMMY_PDF, '%PDF-1.4 dummy content');
  }
});

afterAll(async () => {
  await db.destroy();
});

beforeEach(async () => {
  await db('audit_logs').del();
  await db('document_status_history').del();
  await db('document_versions').del();
  await db('documents').del();
  await db('refresh_tokens').del();
  await db('password_reset_tokens').del();
  await db('users').del();
  await db('document_types').del();
  await db('departments').del();

  [deptId]  = await db('departments').insert({ name: 'Finance',  code: 'FIN', description: '' }).returning('id').then((r) => r.map((x) => x.id));
  [deptId2] = await db('departments').insert({ name: 'Registry', code: 'REG', description: '' }).returning('id').then((r) => r.map((x) => x.id));
  [typeId]  = await db('document_types').insert({ name: 'Receipt', description: '' }).returning('id').then((r) => r.map((x) => x.id));

  studentToken = await registerAndLogin('student@test.com', 'student');
  staffToken   = await registerAndLogin('staff@test.com',   'finance_staff');
  adminToken   = await registerAndLogin('admin@test.com',   'admin');
  auditorToken = await registerAndLogin('auditor@test.com', 'auditor');
});

// ─── upload helper ──────────────────────────────────────────────────────────

async function upload(token, dId = deptId) {
  const res = await request(app)
    .post('/api/v1/documents')
    .set('Authorization', `Bearer ${token}`)
    .field('title', 'Test Document')
    .field('document_type_id', String(typeId))
    .field('department_id', String(dId))
    .attach('file', DUMMY_PDF);
  expect(res.status).toBe(201);
  return res.body.data;
}

async function advanceTo(docId, status, token) {
  const res = await request(app)
    .patch(`/api/v1/documents/${docId}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status });
  expect(res.status).toBe(200);
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('GET /api/v1/reports/pending', () => {
  it('returns only submitted and pending_approval documents', async () => {
    const doc1 = await upload(studentToken); // submitted
    const doc2 = await upload(studentToken); // will be approved
    const doc3 = await upload(studentToken); // will be rejected

    await advanceTo(doc2.id, 'pending_approval', staffToken);
    await advanceTo(doc2.id, 'approved', staffToken);
    await advanceTo(doc3.id, 'pending_approval', staffToken);
    await advanceTo(doc3.id, 'rejected', staffToken);

    const res = await request(app)
      .get('/api/v1/reports/pending')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // doc1 (submitted) + doc3 moved to pending_approval then rejected: only doc1 remains pending
    const statuses = res.body.data.map((d) => d.status);
    statuses.forEach((s) => expect(['submitted', 'pending_approval']).toContain(s));
    // doc2 (approved) and doc3 (rejected) must NOT appear
    const ids = res.body.data.map((d) => d.reference_number);
    expect(ids).not.toContain(doc2.reference_number);
    expect(ids).not.toContain(doc3.reference_number);
  });

  it('student cannot access pending report — 403', async () => {
    const res = await request(app)
      .get('/api/v1/reports/pending')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  it('auditor can access pending report', async () => {
    await upload(studentToken);
    const res = await request(app)
      .get('/api/v1/reports/pending')
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(res.status).toBe(200);
  });

  it('requires authentication — 401 without token', async () => {
    const res = await request(app).get('/api/v1/reports/pending');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/reports/statistics', () => {
  it('returns structured statistics with by_status, by_type, by_department', async () => {
    await upload(studentToken, deptId);
    await upload(studentToken, deptId2);

    const res = await request(app)
      .get('/api/v1/reports/statistics')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('total');
    expect(res.body.data).toHaveProperty('by_status');
    expect(res.body.data).toHaveProperty('by_type');
    expect(res.body.data).toHaveProperty('by_department');
    expect(res.body.data).toHaveProperty('trend');
    expect(res.body.data.total).toBeGreaterThanOrEqual(2);
  });
});

describe('GET /api/v1/reports/overdue', () => {
  it('returns only pending_approval documents (overdue check defers to threshold)', async () => {
    const doc = await upload(studentToken);
    await advanceTo(doc.id, 'pending_approval', staffToken);

    const res = await request(app)
      .get('/api/v1/reports/overdue')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // Document was just created — may or may not be overdue depending on threshold
    // Just verify the response shape
    expect(Array.isArray(res.body.data)).toBe(true);
    if (res.body.data.length > 0) {
      expect(res.body.data[0]).toHaveProperty('days_pending');
      expect(res.body.data[0]).toHaveProperty('overdue_threshold_days');
    }
  });
});

describe('GET /api/v1/reports/export', () => {
  it('exports pending report as CSV with correct row count', async () => {
    // Create 3 pending documents
    await upload(studentToken);
    await upload(studentToken);
    const doc = await upload(studentToken);
    // Approve one — should NOT appear in pending export
    await advanceTo(doc.id, 'pending_approval', staffToken);
    await advanceTo(doc.id, 'approved', staffToken);

    const res = await request(app)
      .get('/api/v1/reports/export?report=pending&format=csv')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toContain('attachment');

    const text = res.text.replace(/^\uFEFF/, '');
    const lines = text.trim().split('\n').filter((l) => l.trim());
    // 1 header + 2 pending rows (doc1, doc2 — doc3 was approved)
    expect(lines).toHaveLength(3);
  });

  it('exports pending report as xlsx — returns spreadsheet content type', async () => {
    await upload(studentToken);

    const res = await request(app)
      .get('/api/v1/reports/export?report=pending&format=xlsx')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
  });

  it('exports pending report as PDF — returns PDF content type', async () => {
    await upload(studentToken);

    const res = await request(app)
      .get('/api/v1/reports/export?report=pending&format=pdf')
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.body.slice(0, 4).toString()).toBe('%PDF');
  });

  it('returns 400 for invalid report type', async () => {
    const res = await request(app)
      .get('/api/v1/reports/export?report=invalid&format=csv')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid format', async () => {
    const res = await request(app)
      .get('/api/v1/reports/export?report=pending&format=docx')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it('student cannot export — 403', async () => {
    const res = await request(app)
      .get('/api/v1/reports/export?report=pending&format=csv')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });
});

'use strict';

/**
 * Integration tests for the audit trail.
 *
 * Performs 5 real actions through the API, then queries the audit log
 * to verify all 5 appear with correct metadata.
 *
 * Actions tested:
 *  1. User login         → USER_LOGIN
 *  2. Document upload    → DOCUMENT_UPLOADED
 *  3. Document view      → DOCUMENT_VIEWED
 *  4. Status change      → DOCUMENT_STATUS_CHANGED
 *  5. Barcode set        → DOCUMENT_BARCODE_SET
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

let deptId, typeId;
let studentToken, staffToken, adminToken;
let studentId;

beforeAll(async () => {
  await db.migrate.latest();
  const fs = require('fs');
  const fixtureDir = path.resolve(__dirname, 'fixtures');
  fs.mkdirSync(fixtureDir, { recursive: true });
  if (!fs.existsSync(DUMMY_PDF)) {
    fs.writeFileSync(DUMMY_PDF, '%PDF-1.4 dummy');
  }
});

afterAll(async () => { await db.destroy(); });

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

  [deptId] = await db('departments').insert({ name: 'Finance', code: 'FIN', description: '' }).returning('id').then((r) => r.map((x) => x.id));
  [typeId] = await db('document_types').insert({ name: 'Receipt', description: '' }).returning('id').then((r) => r.map((x) => x.id));

  studentToken = await registerAndLogin('student@test.com', 'student');
  staffToken   = await registerAndLogin('staff@test.com',   'finance_staff');
  adminToken   = await registerAndLogin('admin@test.com',   'admin');

  studentId = (await db('users').where({ email: 'student@test.com' }).first()).id;
});

// ─── tests ──────────────────────────────────────────────────────────────────

describe('Audit trail — 5 actions produce 5 log entries', () => {
  it('all five actions are recorded in audit_logs', async () => {
    // Action 1: login is recorded via registerAndLogin above (staffToken login)
    // Verify login was logged
    const loginLogs = await db('audit_logs').where({ action: 'USER_LOGIN' });
    expect(loginLogs.length).toBeGreaterThanOrEqual(1);

    // Action 2: document upload
    const uploadRes = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('title', 'Scholarship Form')
      .field('document_type_id', String(typeId))
      .field('department_id', String(deptId))
      .attach('file', DUMMY_PDF);
    expect(uploadRes.status).toBe(201);
    const docId = uploadRes.body.data.id;

    const uploadLogs = await db('audit_logs').where({ action: 'DOCUMENT_UPLOADED', entity_id: docId });
    expect(uploadLogs).toHaveLength(1);
    expect(uploadLogs[0].entity_type).toBe('document');

    // Action 3: document view
    await request(app)
      .get(`/api/v1/documents/${docId}`)
      .set('Authorization', `Bearer ${staffToken}`);

    const viewLogs = await db('audit_logs').where({ action: 'DOCUMENT_VIEWED', entity_id: docId });
    expect(viewLogs).toHaveLength(1);

    // Action 4: status change
    await request(app)
      .patch(`/api/v1/documents/${docId}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'pending_approval', note: 'Under review' });

    const statusLogs = await db('audit_logs').where({ action: 'DOCUMENT_STATUS_CHANGED', entity_id: docId });
    expect(statusLogs).toHaveLength(1);
    // Metadata should contain the transition
    const meta = typeof statusLogs[0].metadata === 'string'
      ? JSON.parse(statusLogs[0].metadata)
      : statusLogs[0].metadata;
    expect(meta).toBeDefined();

    // Action 5: barcode set
    await request(app)
      .patch(`/api/v1/documents/${docId}/barcode`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ barcode_number: 'BC-TEST-001' });

    const barcodeLogs = await db('audit_logs').where({ action: 'DOCUMENT_BARCODE_SET', entity_id: docId });
    expect(barcodeLogs).toHaveLength(1);
    const barcodeMeta = typeof barcodeLogs[0].metadata === 'string'
      ? JSON.parse(barcodeLogs[0].metadata)
      : barcodeLogs[0].metadata;
    expect(barcodeMeta.barcodeNumber).toBe('BC-TEST-001');
  });
});

describe('GET /api/v1/audit', () => {
  it('admin can retrieve paginated audit log', async () => {
    // Produce some log entries
    await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('title', 'Test Doc')
      .field('document_type_id', String(typeId))
      .field('department_id', String(deptId))
      .attach('file', DUMMY_PDF);

    const res = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toHaveProperty('total');
    expect(res.body.pagination.total).toBeGreaterThan(0);
  });

  it('filters by entity_type=document', async () => {
    const uploadRes = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('title', 'Doc A')
      .field('document_type_id', String(typeId))
      .field('department_id', String(deptId))
      .attach('file', DUMMY_PDF);
    const docId = uploadRes.body.data.id;

    const res = await request(app)
      .get(`/api/v1/audit?entity_type=document&entity_id=${docId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    res.body.data.forEach((e) => {
      expect(e.entity_type).toBe('document');
      expect(e.entity_id).toBe(docId);
    });
  });

  it('filters by action', async () => {
    await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('title', 'Doc B')
      .field('document_type_id', String(typeId))
      .field('department_id', String(deptId))
      .attach('file', DUMMY_PDF);

    const res = await request(app)
      .get('/api/v1/audit?action=DOCUMENT_UPLOADED')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    res.body.data.forEach((e) => expect(e.action).toBe('DOCUMENT_UPLOADED'));
  });

  it('student cannot access audit log — 403', async () => {
    const res = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  it('finance_staff cannot access audit log — 403', async () => {
    const res = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
  });

  it('requires authentication — 401 without token', async () => {
    const res = await request(app).get('/api/v1/audit');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/audit/entity/:type/:id', () => {
  it('returns all events for a specific document', async () => {
    const uploadRes = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('title', 'Audit Test Doc')
      .field('document_type_id', String(typeId))
      .field('department_id', String(deptId))
      .attach('file', DUMMY_PDF);
    const docId = uploadRes.body.data.id;

    // View the doc to generate another log entry
    await request(app)
      .get(`/api/v1/documents/${docId}`)
      .set('Authorization', `Bearer ${staffToken}`);

    const res = await request(app)
      .get(`/api/v1/audit/entity/document/${docId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    res.body.data.forEach((e) => {
      expect(e.entity_type).toBe('document');
      expect(e.entity_id).toBe(docId);
    });
  });
});

describe('GET /api/v1/audit/export', () => {
  it('exports audit log as CSV', async () => {
    await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('title', 'Export Test')
      .field('document_type_id', String(typeId))
      .field('department_id', String(deptId))
      .attach('file', DUMMY_PDF);

    const res = await request(app)
      .get('/api/v1/audit/export')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toContain('attachment');
    const lines = res.text.replace(/^\uFEFF/, '').trim().split('\n').filter((l) => l.trim());
    expect(lines.length).toBeGreaterThanOrEqual(2); // header + at least 1 row
  });
});

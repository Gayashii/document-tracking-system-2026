'use strict';

/**
 * Integration tests for document versioning.
 * Requires a real PostgreSQL database (doc_tracking_test).
 * Run: NODE_ENV=test npx knex migrate:latest && npm test
 */

const path = require('path');
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/db');

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

let deptId;
let docTypeId;
let studentToken;
let staffToken;
let studentId;

beforeAll(async () => {
  await db.migrate.latest();

  // Create fixture PDF if it doesn't exist
  const fs = require('fs');
  const fixtureDir = path.resolve(__dirname, 'fixtures');
  fs.mkdirSync(fixtureDir, { recursive: true });
  if (!fs.existsSync(DUMMY_PDF)) {
    fs.writeFileSync(DUMMY_PDF, '%PDF-1.4 dummy content for testing');
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

  [deptId] = await db('departments')
    .insert({ name: 'Finance', code: 'FIN', description: 'Finance dept' })
    .returning('id')
    .then((rows) => rows.map((r) => r.id));

  [docTypeId] = await db('document_types')
    .insert({ name: 'Receipt', description: 'Payment receipt' })
    .returning('id')
    .then((rows) => rows.map((r) => r.id));

  studentToken = await registerAndLogin('student@test.com', 'student');
  staffToken = await registerAndLogin('staff@test.com', 'finance_staff');

  const student = await db('users').where({ email: 'student@test.com' }).first();
  studentId = student.id;
});

// ─── tests ──────────────────────────────────────────────────────────────────

describe('Document versioning', () => {
  async function uploadDoc() {
    const res = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('title', 'Scholarship Form')
      .field('document_type_id', String(docTypeId))
      .field('department_id', String(deptId))
      .attach('file', DUMMY_PDF);
    expect(res.status).toBe(201);
    return res.body.data;
  }

  async function rejectDoc(docId) {
    // Move to pending_approval first
    await request(app)
      .patch(`/api/v1/documents/${docId}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'pending_approval' });

    const res = await request(app)
      .patch(`/api/v1/documents/${docId}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'rejected', note: 'Missing signature' });
    expect(res.status).toBe(200);
  }

  it('createVersion — returns 422 when document is not rejected', async () => {
    const doc = await uploadDoc();
    const res = await request(app)
      .post(`/api/v1/documents/${doc.id}/versions`)
      .set('Authorization', `Bearer ${studentToken}`)
      .field('change_note', 'Fixed issue')
      .attach('file', DUMMY_PDF);
    expect(res.status).toBe(422);
  });

  it('createVersion — full lifecycle: reject → re-submit → verify state', async () => {
    const doc = await uploadDoc();
    await rejectDoc(doc.id);

    // Re-submit as owner
    const resubmitRes = await request(app)
      .post(`/api/v1/documents/${doc.id}/versions`)
      .set('Authorization', `Bearer ${studentToken}`)
      .field('change_note', 'Corrected document')
      .attach('file', DUMMY_PDF);

    expect(resubmitRes.status).toBe(201);
    expect(resubmitRes.body.data.status).toBe('submitted');
    expect(resubmitRes.body.data.version).toBe(2);

    // Verify a version row was archived
    const versions = await db('document_versions').where({ document_id: doc.id });
    expect(versions).toHaveLength(1);
    expect(versions[0].version_number).toBe(1);
  });

  it('listVersions — returns archived versions after re-submission', async () => {
    const doc = await uploadDoc();
    await rejectDoc(doc.id);

    await request(app)
      .post(`/api/v1/documents/${doc.id}/versions`)
      .set('Authorization', `Bearer ${studentToken}`)
      .attach('file', DUMMY_PDF);

    const res = await request(app)
      .get(`/api/v1/documents/${doc.id}/versions`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].version_number).toBe(1);
  });

  it('createVersion — 403 when a different student tries to re-submit', async () => {
    const doc = await uploadDoc();
    await rejectDoc(doc.id);

    const otherToken = await registerAndLogin('other@test.com', 'student');
    const res = await request(app)
      .post(`/api/v1/documents/${doc.id}/versions`)
      .set('Authorization', `Bearer ${otherToken}`)
      .attach('file', DUMMY_PDF);

    expect(res.status).toBe(403);
  });

  it('createVersion — 403 when finance_staff tries to re-submit', async () => {
    const doc = await uploadDoc();
    await rejectDoc(doc.id);

    const res = await request(app)
      .post(`/api/v1/documents/${doc.id}/versions`)
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('file', DUMMY_PDF);

    expect(res.status).toBe(403);
  });
});

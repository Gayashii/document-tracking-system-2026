'use strict';

/**
 * Integration tests for RBAC — role-based access control.
 * Requires a real PostgreSQL database (doc_tracking_test).
 * Run: NODE_ENV=test npx knex migrate:latest && npm test
 */

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

let _seedSeq = 0;
async function seedDocument(studentId, deptId, docTypeId) {
  const [doc] = await db('documents')
    .insert({
      reference_number: `PGI-TEST-${String(++_seedSeq).padStart(6, '0')}`,
      title: 'Test Document',
      document_type_id: docTypeId,
      department_id: deptId,
      student_id: studentId,
      status: 'submitted',
      file_path: '/uploads/documents/test/v1/test.pdf',
      file_size: 1024,
      mime_type: 'application/pdf',
    })
    .returning('id');
  return doc.id;
}

// ─── setup / teardown ───────────────────────────────────────────────────────

let deptId;
let docTypeId;

beforeAll(async () => {
  await db.migrate.latest();
});

afterAll(async () => {
  await db.destroy();
});

beforeEach(async () => {
  await db('audit_logs').del();
  await db('document_status_history').del();
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
});

// ─── tests ──────────────────────────────────────────────────────────────────

describe('authorize middleware — route-level role checks', () => {
  it('blocks student from accessing user management (admin-only)', async () => {
    const studentToken = await registerAndLogin('student@test.com', 'student');
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toBe('Insufficient role');
  });

  it('blocks finance_staff from accessing user management', async () => {
    const staffToken = await registerAndLogin('staff@test.com', 'finance_staff');
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
  });
});

describe('service-level ownership — student cross-access', () => {
  it('returns 403 when student A requests student B\'s document', async () => {
    const tokenA = await registerAndLogin('studentA@test.com', 'student');
    const tokenB = await registerAndLogin('studentB@test.com', 'student');

    // Identify student A's DB id
    const userA = await db('users').where({ email: 'studentA@test.com' }).first();
    const docId = await seedDocument(userA.id, deptId, docTypeId);

    const res = await request(app)
      .get(`/api/v1/documents/${docId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('auditor — read-only access', () => {
  it('auditor can GET a document', async () => {
    const studentToken = await registerAndLogin('student@test.com', 'student');
    const auditorToken = await registerAndLogin('auditor@test.com', 'auditor');

    const student = await db('users').where({ email: 'student@test.com' }).first();
    const docId = await seedDocument(student.id, deptId, docTypeId);

    const res = await request(app)
      .get(`/api/v1/documents/${docId}`)
      .set('Authorization', `Bearer ${auditorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('auditor cannot PATCH document status (returns 403)', async () => {
    const studentToken = await registerAndLogin('student@test.com', 'student');
    const auditorToken = await registerAndLogin('auditor@test.com', 'auditor');

    const student = await db('users').where({ email: 'student@test.com' }).first();
    const docId = await seedDocument(student.id, deptId, docTypeId);

    const res = await request(app)
      .patch(`/api/v1/documents/${docId}/status`)
      .set('Authorization', `Bearer ${auditorToken}`)
      .send({ status: 'pending_approval' });

    expect(res.status).toBe(403);
  });
});

describe('soft delete — admin-only', () => {
  it('admin can soft-delete a document', async () => {
    const adminToken = await registerAndLogin('admin@test.com', 'admin');
    const studentToken = await registerAndLogin('student@test.com', 'student');

    const student = await db('users').where({ email: 'student@test.com' }).first();
    const docId = await seedDocument(student.id, deptId, docTypeId);

    const res = await request(app)
      .delete(`/api/v1/documents/${docId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(204);

    // Document should be excluded from list queries
    const row = await db('documents').where({ id: docId }).whereNull('deleted_at').first();
    expect(row).toBeUndefined();
  });

  it('student cannot soft-delete a document (returns 403)', async () => {
    const studentToken = await registerAndLogin('student@test.com', 'student');
    const student = await db('users').where({ email: 'student@test.com' }).first();
    const docId = await seedDocument(student.id, deptId, docTypeId);

    const res = await request(app)
      .delete(`/api/v1/documents/${docId}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });

  it('finance_staff cannot soft-delete a document (returns 403)', async () => {
    const staffToken = await registerAndLogin('staff@test.com', 'finance_staff');
    const studentToken = await registerAndLogin('student@test.com', 'student');

    const student = await db('users').where({ email: 'student@test.com' }).first();
    const docId = await seedDocument(student.id, deptId, docTypeId);

    const res = await request(app)
      .delete(`/api/v1/documents/${docId}`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(403);
  });
});

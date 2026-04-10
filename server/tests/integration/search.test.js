'use strict';

/**
 * Integration tests for GET /api/v1/documents/search
 *
 * Seeds 10 documents with varied metadata, runs 5 filter combinations,
 * verifies correct subsets are returned.
 *
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
let deptId2;
let typeReceipt;
let typeScholarship;
let studentToken;
let student2Token;
let staffToken;
let studentId;
let student2Id;

beforeAll(async () => {
  await db.migrate.latest();

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
  // Teardown in FK-safe order
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
    .insert({ name: 'Finance', code: 'FIN', description: 'Finance' })
    .returning('id').then((r) => r.map((x) => x.id));

  [deptId2] = await db('departments')
    .insert({ name: 'Registry', code: 'REG', description: 'Registry' })
    .returning('id').then((r) => r.map((x) => x.id));

  [typeReceipt] = await db('document_types')
    .insert({ name: 'Receipt', description: 'Payment receipt' })
    .returning('id').then((r) => r.map((x) => x.id));

  [typeScholarship] = await db('document_types')
    .insert({ name: 'Scholarship Form', description: 'Scholarship application' })
    .returning('id').then((r) => r.map((x) => x.id));

  studentToken  = await registerAndLogin('student@test.com',  'student');
  student2Token = await registerAndLogin('student2@test.com', 'student');
  staffToken    = await registerAndLogin('staff@test.com',    'finance_staff');

  studentId  = (await db('users').where({ email: 'student@test.com'  }).first()).id;
  student2Id = (await db('users').where({ email: 'student2@test.com' }).first()).id;
});

// ─── upload helper ──────────────────────────────────────────────────────────

async function upload(token, fields = {}) {
  const req = request(app)
    .post('/api/v1/documents')
    .set('Authorization', `Bearer ${token}`)
    .field('title',             fields.title            ?? 'Default Title')
    .field('document_type_id',  String(fields.typeId    ?? typeReceipt))
    .field('department_id',     String(fields.deptId    ?? deptId))
    .attach('file', DUMMY_PDF);

  if (fields.financial_amount != null)
    req.field('financial_amount', String(fields.financial_amount));
  if (fields.academic_year)
    req.field('academic_year', fields.academic_year);

  const res = await req;
  expect(res.status).toBe(201);
  return res.body.data;
}

async function advanceTo(docId, status, token) {
  await request(app)
    .patch(`/api/v1/documents/${docId}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status });
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('GET /api/v1/documents/search', () => {
  async function seedDocuments() {
    // 10 documents with varied metadata
    const docs = [];
    // student1 uploads 7 docs (different types, depts, amounts, statuses)
    docs.push(await upload(studentToken, { title: 'Scholarship Application Alpha',   typeId: typeScholarship, deptId, financial_amount: 5000 }));
    docs.push(await upload(studentToken, { title: 'Receipt for Lab Fees',            typeId: typeReceipt,    deptId, financial_amount: 200  }));
    docs.push(await upload(studentToken, { title: 'Refund Request Beta',             typeId: typeReceipt,    deptId: deptId2, financial_amount: 150  }));
    docs.push(await upload(studentToken, { title: 'Scholarship Application Gamma',   typeId: typeScholarship, deptId: deptId2 }));
    docs.push(await upload(studentToken, { title: 'Fee Payment Confirmation Delta',  typeId: typeReceipt,    deptId, financial_amount: 3000 }));
    docs.push(await upload(studentToken, { title: 'Bursary Form Epsilon',            typeId: typeScholarship, deptId }));
    docs.push(await upload(studentToken, { title: 'Tuition Receipt Zeta',            typeId: typeReceipt,    deptId, financial_amount: 800  }));

    // student2 uploads 3 docs
    docs.push(await upload(student2Token, { title: 'Receipt Student Two Eta',        typeId: typeReceipt,    deptId,              financial_amount: 100  }));
    docs.push(await upload(student2Token, { title: 'Scholarship Form Student Two',   typeId: typeScholarship, deptId: deptId2 }));
    docs.push(await upload(student2Token, { title: 'Lab Fee Invoice Iota',           typeId: typeReceipt,    deptId: deptId2, financial_amount: 50   }));

    // Advance some docs through workflow to get varied statuses
    await advanceTo(docs[0].id, 'pending_approval', staffToken);
    await advanceTo(docs[1].id, 'pending_approval', staffToken);
    await advanceTo(docs[1].id, 'approved',         staffToken);
    await advanceTo(docs[2].id, 'pending_approval', staffToken);
    await advanceTo(docs[2].id, 'rejected',         staffToken);

    return docs;
  }

  it('returns all documents (no filters) for staff', async () => {
    await seedDocuments();
    const res = await request(app)
      .get('/api/v1/documents/search')
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(10);
    expect(res.body.pagination.total).toBe(10);
  });

  it('filter 1 — keyword search finds matching titles', async () => {
    await seedDocuments();
    const res = await request(app)
      .get('/api/v1/documents/search?q=scholarship')
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    // 4 scholarship docs: Alpha, Gamma, Epsilon, Form Student Two
    expect(res.body.pagination.total).toBe(4);
    res.body.data.forEach(d =>
      expect(d.document_type_name ?? d.documentType ?? d.title).toMatch(/[Ss]cholarship/),
    );
  });

  it('filter 2 — status filter returns only matching status docs', async () => {
    await seedDocuments();
    const res = await request(app)
      .get('/api/v1/documents/search?status=approved')
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(1);
    expect(res.body.data[0].status).toBe('approved');
  });

  it('filter 3 — department filter returns only docs in that department', async () => {
    await seedDocuments();
    const res = await request(app)
      .get(`/api/v1/documents/search?department_id=${deptId2}`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(4); // Refund Beta, Gamma, Student Two Scholarship, Iota
  });

  it('filter 4 — financial amount range returns matching docs', async () => {
    await seedDocuments();
    const res = await request(app)
      .get('/api/v1/documents/search?amount_min=500&amount_max=4000')
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    // amounts in range [500,4000]: 5000 no, 200 no, 150 no, 3000 yes, 800 yes
    expect(res.body.pagination.total).toBe(2);
    res.body.data.forEach(d => {
      const amount = parseFloat(d.financial_amount ?? d.financialAmount ?? '0');
      expect(amount).toBeGreaterThanOrEqual(500);
      expect(amount).toBeLessThanOrEqual(4000);
    });
  });

  it('filter 5 — combined: document type + status', async () => {
    await seedDocuments();
    const res = await request(app)
      .get(`/api/v1/documents/search?type=${typeReceipt}&status=submitted`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    res.body.data.forEach(d => expect(d.status).toBe('submitted'));
  });

  // ── Role scoping ──────────────────────────────────────────────────────────

  it('student sees only own documents', async () => {
    await seedDocuments();
    const res = await request(app)
      .get('/api/v1/documents/search')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(7);
    res.body.data.forEach(d => {
      expect(d.student_id ?? d.studentId).toBe(studentId);
    });
  });

  it('student cannot bypass scoping with explicit student_id param', async () => {
    await seedDocuments();
    const res = await request(app)
      .get(`/api/v1/documents/search?student_id=${student2Id}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    // Must still return only student1's documents
    expect(res.body.pagination.total).toBe(7);
    res.body.data.forEach(d => {
      expect(d.student_id ?? d.studentId).toBe(studentId);
    });
  });

  it('requires authentication — 401 without token', async () => {
    const res = await request(app).get('/api/v1/documents/search');
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid query params', async () => {
    const res = await request(app)
      .get('/api/v1/documents/search?status=invalid_status')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(400);
  });
});

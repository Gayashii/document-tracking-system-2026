'use strict';

/**
 * Integration tests for document assignment & phase-based processing.
 *
 * Flow tested:
 *  1. Admin creates workflow with 2 phases (staff1 → staff2) before submission
 *  2. Student submits document → auto-assigned to staff1, status = pending_approval
 *  3. Manual assign is rejected for workflow-typed documents
 *  4. staff1 advances → phase 2, assignee = staff2
 *  5. staff2 returns → phase 1, assignee = staff1
 *  6. staff1 advances again → phase 2
 *  7. staff2 resolves (approve) → status = approved
 *  8. Phase log has entries
 *  9. Non-assignee cannot advance
 * 10. Cannot advance past final phase without resolving
 * 11. Document type with no workflow: manual self-assign + direct resolve works
 */

const path = require('path');
const fs   = require('fs');
const request = require('supertest');
const app     = require('../../src/app');
const db      = require('../../src/config/db');

const DUMMY_PDF    = path.resolve(__dirname, 'fixtures/dummy.pdf');
const fixtureDir   = path.resolve(__dirname, 'fixtures');

if (!fs.existsSync(fixtureDir)) fs.mkdirSync(fixtureDir, { recursive: true });
if (!fs.existsSync(DUMMY_PDF))  fs.writeFileSync(DUMMY_PDF, '%PDF-1.4 dummy content for testing');

async function registerAndLogin(email, role) {
  await request(app).post('/api/v1/auth/register').send({ email, password: 'Password@123', role });
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'Password@123' });
  return { token: res.body.data.accessToken, userId: res.body.data.user.id };
}

let adminToken, staff1Token, staff1Id, staff2Token, staff2Id, studentToken;
let deptId, typeId, typeNoFlowId, workflowId, docId, docNoFlowId;

beforeAll(async () => {
  const admin   = await registerAndLogin(`adm_ph_${Date.now()}@test.com`, 'admin');
  const staff1  = await registerAndLogin(`s1_ph_${Date.now()}@test.com`, 'finance_staff');
  const staff2  = await registerAndLogin(`s2_ph_${Date.now()}@test.com`, 'finance_staff');
  const student = await registerAndLogin(`stu_ph_${Date.now()}@test.com`, 'student');

  adminToken   = admin.token;
  staff1Token  = staff1.token;
  staff1Id     = staff1.userId;
  staff2Token  = staff2.token;
  staff2Id     = staff2.userId;
  studentToken = student.token;

  // Create dept + document types
  const deptRes = await request(app).post('/api/v1/departments')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Phase Test Dept', code: `PH${Date.now()}` });
  deptId = deptRes.body.data.id;

  const typeRes = await request(app).post('/api/v1/document-types')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `Phase Type ${Date.now()}`, requires_approval: true });
  typeId = typeRes.body.data.id;

  const typeNoFlowRes = await request(app).post('/api/v1/document-types')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `NoFlow Type ${Date.now()}`, requires_approval: false });
  typeNoFlowId = typeNoFlowRes.body.data.id;

  // Create workflow and set steps BEFORE student submits, so auto-assign works
  const wfRes = await request(app).post('/api/v1/workflows')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Two-Phase Flow', document_type_id: typeId });
  workflowId = wfRes.body.data.id;

  await request(app).put(`/api/v1/workflows/${workflowId}/steps`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      steps: [
        { phase_label: 'Initial Review', assigned_user_id: staff1Id },
        { phase_label: 'Final Approval', assigned_user_id: staff2Id },
      ],
    });
});

afterAll(async () => { await db.destroy(); });

// ─── 1. Workflow template management ─────────────────────────────────────────

describe('Workflow template management', () => {
  it('workflow was created with correct steps', async () => {
    const res = await request(app).get(`/api/v1/workflows/${workflowId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.steps).toHaveLength(2);
    expect(res.body.data.steps[0].step_order).toBe(1);
    expect(res.body.data.steps[1].step_order).toBe(2);
  });

  it('duplicate document_type_id is rejected', async () => {
    const res = await request(app).post('/api/v1/workflows')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Duplicate', document_type_id: typeId });
    expect(res.status).toBe(409);
  });

  it('non-admin cannot manage workflows', async () => {
    const res = await request(app).get('/api/v1/workflows')
      .set('Authorization', `Bearer ${staff1Token}`);
    expect(res.status).toBe(403);
  });
});

// ─── 2. Document submission — auto-assign ─────────────────────────────────────

describe('Auto-assignment on submission', () => {
  it('student submits document — auto-assigned to staff1, status = pending_approval', async () => {
    const res = await request(app).post('/api/v1/documents')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('title', 'Phase Test Document')
      .field('document_type_id', String(typeId))
      .field('department_id', String(deptId))
      .attach('file', DUMMY_PDF);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending_approval');
    docId = res.body.data.id;
  });

  it('phase info shows staff1 on phase 1 immediately after submission', async () => {
    const res = await request(app).get(`/api/v1/documents/${docId}/phase`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.current_step.step_order).toBe(1);
    expect(res.body.data.assigned_to.id).toBe(staff1Id);
  });

  it('manual assign is rejected for workflow-typed documents', async () => {
    const res = await request(app).post(`/api/v1/documents/${docId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assigned_to_id: staff1Id });
    expect(res.status).toBe(400);
  });

  it('student cannot call the assign endpoint', async () => {
    const res = await request(app).post(`/api/v1/documents/${docId}/assign`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({});
    expect(res.status).toBe(403);
  });
});

// ─── 3. Phase transitions ─────────────────────────────────────────────────────

describe('Phase transitions', () => {
  it('non-assignee (staff2) cannot advance', async () => {
    const res = await request(app).post(`/api/v1/documents/${docId}/phase/advance`)
      .set('Authorization', `Bearer ${staff2Token}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it('staff1 advances to phase 2', async () => {
    const res = await request(app).post(`/api/v1/documents/${docId}/phase/advance`)
      .set('Authorization', `Bearer ${staff1Token}`)
      .send({ note: 'Looks good, passing to final' });
    expect(res.status).toBe(200);
  });

  it('phase 2 is active, assignee is staff2', async () => {
    const res = await request(app).get(`/api/v1/documents/${docId}/phase`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.current_step.step_order).toBe(2);
    expect(res.body.data.assigned_to.id).toBe(staff2Id);
  });

  it('staff2 returns to phase 1', async () => {
    const res = await request(app).post(`/api/v1/documents/${docId}/phase/return`)
      .set('Authorization', `Bearer ${staff2Token}`)
      .send({ note: 'Needs revision' });
    expect(res.status).toBe(200);
  });

  it('phase 1 is active again, assignee is staff1', async () => {
    const res = await request(app).get(`/api/v1/documents/${docId}/phase`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.current_step.step_order).toBe(1);
    expect(res.body.data.assigned_to.id).toBe(staff1Id);
  });

  it('cannot return from phase 1', async () => {
    const res = await request(app).post(`/api/v1/documents/${docId}/phase/return`)
      .set('Authorization', `Bearer ${staff1Token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('staff1 advances again to phase 2', async () => {
    const res = await request(app).post(`/api/v1/documents/${docId}/phase/advance`)
      .set('Authorization', `Bearer ${staff1Token}`)
      .send({});
    expect(res.status).toBe(200);
  });

  it('cannot advance past final phase', async () => {
    const res = await request(app).post(`/api/v1/documents/${docId}/phase/advance`)
      .set('Authorization', `Bearer ${staff2Token}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

// ─── 4. Resolution ────────────────────────────────────────────────────────────

describe('Phase resolution', () => {
  it('admin cannot resolve mid-workflow (is not the assignee)', async () => {
    const res = await request(app).post(`/api/v1/documents/${docId}/phase/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'approved' });
    expect(res.status).toBe(403);
  });

  it('staff2 resolves with approval', async () => {
    const res = await request(app).post(`/api/v1/documents/${docId}/phase/resolve`)
      .set('Authorization', `Bearer ${staff2Token}`)
      .send({ decision: 'approved', note: 'All good' });
    expect(res.status).toBe(200);
  });

  it('document status is now approved', async () => {
    const res = await request(app).get(`/api/v1/documents/${docId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.status).toBe('approved');
  });

  it('phase log has at least 5 entries', async () => {
    const res = await request(app).get(`/api/v1/documents/${docId}/phase`)
      .set('Authorization', `Bearer ${adminToken}`);
    // assigned(auto), advanced, returned, advanced, resolved
    expect(res.body.data.phase_log.length).toBeGreaterThanOrEqual(5);
  });
});

// ─── 5. No-workflow direct resolve ────────────────────────────────────────────

describe('No-workflow direct resolve', () => {
  it('student submits doc with no-flow type — stays submitted', async () => {
    const res = await request(app).post('/api/v1/documents')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('title', 'No Flow Doc')
      .field('document_type_id', String(typeNoFlowId))
      .field('department_id', String(deptId))
      .attach('file', DUMMY_PDF);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('submitted');
    docNoFlowId = res.body.data.id;
  });

  it('staff self-assigns (no workflow — manual assign allowed)', async () => {
    const res = await request(app).post(`/api/v1/documents/${docNoFlowId}/assign`)
      .set('Authorization', `Bearer ${staff1Token}`)
      .send({});
    expect(res.status).toBe(200);
  });

  it('phase info shows no workflow', async () => {
    const res = await request(app).get(`/api/v1/documents/${docNoFlowId}/phase`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.has_workflow).toBe(false);
  });

  it('staff resolves directly (reject requires note)', async () => {
    const res = await request(app).post(`/api/v1/documents/${docNoFlowId}/phase/resolve`)
      .set('Authorization', `Bearer ${staff1Token}`)
      .send({ decision: 'rejected' }); // missing note
    expect(res.status).toBe(400);
  });

  it('staff resolves with valid rejection note', async () => {
    const res = await request(app).post(`/api/v1/documents/${docNoFlowId}/phase/resolve`)
      .set('Authorization', `Bearer ${staff1Token}`)
      .send({ decision: 'rejected', note: 'Missing supporting docs' });
    expect(res.status).toBe(200);

    const docRes = await request(app).get(`/api/v1/documents/${docNoFlowId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(docRes.body.data.status).toBe('rejected');
  });
});

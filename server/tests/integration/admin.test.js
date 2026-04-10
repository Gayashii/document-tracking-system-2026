'use strict';

/**
 * Integration tests for the admin panel endpoints (Task 3.4).
 *
 * Covers:
 *  1. Create user → login with new credentials → deactivate → login fails
 *  2. Department CRUD (create / update / delete)
 *  3. Document-type CRUD (create / update / toggle is_active / delete)
 *  4. System settings read → patch max_file_size_mb → verify new value
 */

const request = require('supertest');
const app = require('../../src/app');
const db  = require('../../src/config/db');

// ─── helpers ────────────────────────────────────────────────────────────────

async function loginAs(email, password = 'Password@123') {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return res.body?.data?.accessToken ?? null;
}

async function registerAndLogin(email, role) {
  await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password: 'Password@123', role });
  return loginAs(email);
}

// ─── setup / teardown ───────────────────────────────────────────────────────

let adminToken;
let createdUserId, createdDeptId, createdTypeId;

beforeAll(async () => {
  adminToken = await registerAndLogin(`admin_${Date.now()}@test.com`, 'admin');
});

afterAll(async () => {
  await db.destroy();
});

// ─── 1. User lifecycle ───────────────────────────────────────────────────────

describe('Admin user management', () => {
  const newEmail = `newuser_${Date.now()}@test.com`;

  it('admin can create a new user', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: newEmail, password: 'Password@123', role: 'student' });

    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe(newEmail);
    createdUserId = res.body.data.id;
  });

  it('new user can log in', async () => {
    const token = await loginAs(newEmail);
    expect(token).not.toBeNull();
  });

  it('admin can update user role', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${createdUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'auditor', is_active: true });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('auditor');
  });

  it('admin can deactivate the user', async () => {
    const res = await request(app)
      .delete(`/api/v1/users/${createdUserId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(204);
  });

  it('deactivated user cannot log in', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: newEmail, password: 'Password@123' });

    expect(res.status).toBe(401);
  });

  it('non-admin cannot access user management', async () => {
    const studentToken = await registerAndLogin(`student_${Date.now()}@test.com`, 'student');
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });
});

// ─── 2. Department CRUD ──────────────────────────────────────────────────────

describe('Admin department management', () => {
  it('admin can create a department', async () => {
    const res = await request(app)
      .post('/api/v1/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Dept', code: `TD${Date.now()}`, description: 'Created in test' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Test Dept');
    createdDeptId = res.body.data.id;
  });

  it('admin can list departments', async () => {
    const res = await request(app)
      .get('/api/v1/departments')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((d) => d.id === createdDeptId)).toBe(true);
  });

  it('admin can update a department', async () => {
    const res = await request(app)
      .patch(`/api/v1/departments/${createdDeptId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Dept', code: `UPD${Date.now()}` });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Dept');
  });

  it('admin can delete a department with no documents', async () => {
    const res = await request(app)
      .delete(`/api/v1/departments/${createdDeptId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(204);
  });

  it('duplicate code is rejected', async () => {
    const code = `DUP${Date.now()}`;
    await request(app)
      .post('/api/v1/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dept A', code });

    const res = await request(app)
      .post('/api/v1/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dept B', code });

    expect(res.status).toBe(409);
  });
});

// ─── 3. Document-type CRUD ───────────────────────────────────────────────────

describe('Admin document-type management', () => {
  it('admin can create a document type', async () => {
    const res = await request(app)
      .post('/api/v1/document-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Test Type ${Date.now()}`, requires_approval: true });

    expect(res.status).toBe(201);
    expect(res.body.data.requires_approval).toBe(true);
    createdTypeId = res.body.data.id;
  });

  it('admin can list document types', async () => {
    const res = await request(app)
      .get('/api/v1/document-types')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.some((t) => t.id === createdTypeId)).toBe(true);
  });

  it('admin can deactivate a document type', async () => {
    const res = await request(app)
      .patch(`/api/v1/document-types/${createdTypeId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: false });

    expect(res.status).toBe(200);
    expect(res.body.data.is_active).toBe(false);
  });

  it('admin can delete a document type with no documents', async () => {
    const res = await request(app)
      .delete(`/api/v1/document-types/${createdTypeId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(204);
  });
});

// ─── 4. System settings ──────────────────────────────────────────────────────

describe('Admin system settings', () => {
  it('admin can read all settings', async () => {
    const res = await request(app)
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const keys = res.body.data.map((r) => r.key);
    expect(keys).toContain('max_file_size_mb');
    expect(keys).toContain('session_timeout_minutes');
  });

  it('admin can update max_file_size_mb', async () => {
    const res = await request(app)
      .patch('/api/v1/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ settings: { max_file_size_mb: '25' } });

    expect(res.status).toBe(200);
    const updated = res.body.data.find((r) => r.key === 'max_file_size_mb');
    expect(updated?.value).toBe('25');
  });

  it('updated value persists on subsequent read', async () => {
    const res = await request(app)
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${adminToken}`);

    const row = res.body.data.find((r) => r.key === 'max_file_size_mb');
    expect(row?.value).toBe('25');
  });

  it('non-admin cannot read settings', async () => {
    const auditorToken = await registerAndLogin(`auditor_${Date.now()}@test.com`, 'auditor');
    const res = await request(app)
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(res.status).toBe(403);
  });

  it('unknown setting key is rejected', async () => {
    const res = await request(app)
      .patch('/api/v1/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ settings: { nonexistent_key: 'value' } });
    expect(res.status).toBe(400);
  });
});

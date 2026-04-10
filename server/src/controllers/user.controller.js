'use strict';

const bcrypt = require('bcrypt');
const db = require('../config/db');
const auditService = require('../services/auditService');
const asyncWrapper = require('../utils/asyncWrapper');
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors');
const { AUDIT_ACTIONS } = require('../constants/auditActions');
const { ROLES } = require('../constants/roles');

const USER_COLS = ['id', 'email', 'role', 'is_active', 'last_login_at', 'created_at', 'updated_at'];

// ── List ──────────────────────────────────────────────────────────────────────

const list = asyncWrapper(async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const qb = db('users').select(USER_COLS);

  if (req.query.search) {
    qb.where('email', 'ilike', `%${req.query.search}%`);
  }
  if (req.query.role)   qb.where('role', req.query.role);
  if (req.query.status) qb.where('is_active', req.query.status === 'active');

  const [{ count }] = await qb.clone().clearSelect().count('id as count');
  const users = await qb.clone().orderBy('created_at', 'desc').limit(limit).offset(offset);

  res.json({
    success: true,
    data: users,
    pagination: { page, limit, total: parseInt(count), totalPages: Math.ceil(count / limit) },
  });
});

// ── Create ────────────────────────────────────────────────────────────────────

const create = asyncWrapper(async (req, res) => {
  const { email, password, role } = req.body;

  const existing = await db('users').where({ email }).first();
  if (existing) throw new ConflictError('A user with that email already exists');

  const SALT_ROUNDS = 12;
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const [user] = await db('users')
    .insert({ email, password_hash: passwordHash, role: role || ROLES.STUDENT })
    .returning(USER_COLS);

  await auditService.log({
    actorId: req.user.id,
    action: AUDIT_ACTIONS.ADMIN_USER_CREATED,
    entityType: 'user',
    entityId: user.id,
    metadata: { email, role: user.role },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(201).json({ success: true, data: user });
});

// ── Update ────────────────────────────────────────────────────────────────────

const update = asyncWrapper(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = await db('users').where({ id }).first();
  if (!existing) throw new NotFoundError('User not found');

  const updates = {};
  if (req.body.role      != null) updates.role      = req.body.role;
  if (req.body.is_active != null) updates.is_active = req.body.is_active;

  if (!Object.keys(updates).length) {
    throw new ValidationError('No updatable fields provided');
  }

  const auditMeta = { ...updates };
  updates.updated_at = db.fn.now();

  const [user] = await db('users').where({ id }).update(updates).returning(USER_COLS);

  await auditService.log({
    actorId: req.user.id,
    action: AUDIT_ACTIONS.USER_UPDATED,
    entityType: 'user',
    entityId: id,
    metadata: auditMeta,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, data: user });
});

// ── Deactivate ────────────────────────────────────────────────────────────────

const deactivate = asyncWrapper(async (req, res) => {
  const id = parseInt(req.params.id, 10);

  // Prevent self-deactivation
  if (id === req.user.id) throw new ValidationError('You cannot deactivate your own account');

  const existing = await db('users').where({ id }).first();
  if (!existing) throw new NotFoundError('User not found');

  // Prevent removing the last active admin
  if (existing.role === ROLES.ADMIN) {
    const { count } = await db('users')
      .where({ role: ROLES.ADMIN, is_active: true })
      .count('id as count')
      .first();
    if (parseInt(count, 10) <= 1) {
      throw new ValidationError('Cannot deactivate the last active admin account');
    }
  }

  await db.transaction(async (trx) => {
    await trx('users').where({ id }).update({ is_active: false, updated_at: trx.fn.now() });
    // Revoke all refresh tokens immediately
    await trx('refresh_tokens').where({ user_id: id }).del();
  });

  await auditService.log({
    actorId: req.user.id,
    action: AUDIT_ACTIONS.ADMIN_USER_DEACTIVATED,
    entityType: 'user',
    entityId: id,
    metadata: { email: existing.email },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(204).end();
});

// ── MFA reset ─────────────────────────────────────────────────────────────────

const resetMfa = asyncWrapper(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = await db('users').where({ id }).first();
  if (!existing) throw new NotFoundError('User not found');

  await db('users').where({ id }).update({ updated_at: db.fn.now() });

  await auditService.log({
    actorId: req.user.id,
    action: AUDIT_ACTIONS.USER_MFA_DISABLED,
    entityType: 'user',
    entityId: id,
    metadata: { reason: 'admin_force_reset' },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, message: 'MFA reset. User must re-enrol on next login.' });
});

module.exports = { list, create, update, deactivate, resetMfa };

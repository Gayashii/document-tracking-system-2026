'use strict';

const db = require('../config/db');
const auditService = require('../services/auditService');
const asyncWrapper = require('../utils/asyncWrapper');
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors');
const { AUDIT_ACTIONS } = require('../constants/auditActions');

const list = asyncWrapper(async (req, res) => {
  const rows = await db('departments').orderBy('name');
  res.json({ success: true, data: rows });
});

const create = asyncWrapper(async (req, res) => {
  const { name, code, description } = req.body;

  const existing = await db('departments').where({ code }).first();
  if (existing) throw new ConflictError(`Department code '${code}' already exists`);

  const [dept] = await db('departments')
    .insert({ name, code: code.toUpperCase(), description: description || null })
    .returning('*');

  await auditService.log({
    actorId: req.user.id,
    action: AUDIT_ACTIONS.DEPARTMENT_CREATED,
    entityType: 'department',
    entityId: dept.id,
    metadata: { name, code },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(201).json({ success: true, data: dept });
});

const update = asyncWrapper(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = await db('departments').where({ id }).first();
  if (!existing) throw new NotFoundError('Department not found');

  const updates = {};
  if (req.body.name        != null) updates.name        = req.body.name;
  if (req.body.code        != null) updates.code        = req.body.code.toUpperCase();
  if (req.body.description != null) updates.description = req.body.description;
  if (!Object.keys(updates).length) throw new ValidationError('No updatable fields provided');

  const [dept] = await db('departments').where({ id }).update(updates).returning('*');

  await auditService.log({
    actorId: req.user.id,
    action: AUDIT_ACTIONS.DEPARTMENT_UPDATED,
    entityType: 'department',
    entityId: id,
    metadata: updates,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, data: dept });
});

const remove = asyncWrapper(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = await db('departments').where({ id }).first();
  if (!existing) throw new NotFoundError('Department not found');

  // Block deletion if documents reference this department
  const docCount = await db('documents')
    .where({ department_id: id }).whereNull('deleted_at').count('id as count').first();
  if (parseInt(docCount.count, 10) > 0) {
    throw new ConflictError('Cannot delete a department that has associated documents');
  }

  await db('departments').where({ id }).del();
  res.status(204).end();
});

module.exports = { list, create, update, remove };

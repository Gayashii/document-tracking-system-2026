'use strict';

const db = require('../config/db');
const auditService = require('../services/auditService');
const asyncWrapper = require('../utils/asyncWrapper');
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors');
const { AUDIT_ACTIONS } = require('../constants/auditActions');

const list = asyncWrapper(async (req, res) => {
  const rows = await db('document_types').orderBy('name');
  res.json({ success: true, data: rows });
});

const create = asyncWrapper(async (req, res) => {
  const { name, description, requires_approval } = req.body;

  const existing = await db('document_types').where({ name }).first();
  if (existing) throw new ConflictError(`Document type '${name}' already exists`);

  const [docType] = await db('document_types')
    .insert({
      name,
      description: description || null,
      requires_approval: requires_approval ?? false,
    })
    .returning('*');

  await auditService.log({
    actorId: req.user.id,
    action: AUDIT_ACTIONS.DOCUMENT_TYPE_CREATED,
    entityType: 'document_type',
    entityId: docType.id,
    metadata: { name },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(201).json({ success: true, data: docType });
});

const update = asyncWrapper(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = await db('document_types').where({ id }).first();
  if (!existing) throw new NotFoundError('Document type not found');

  const updates = {};
  if (req.body.name              != null) updates.name              = req.body.name;
  if (req.body.description       != null) updates.description       = req.body.description;
  if (req.body.requires_approval != null) updates.requires_approval = req.body.requires_approval;
  if (req.body.is_active         != null) updates.is_active         = req.body.is_active;
  if (!Object.keys(updates).length) throw new ValidationError('No updatable fields provided');

  const [docType] = await db('document_types').where({ id }).update(updates).returning('*');

  await auditService.log({
    actorId: req.user.id,
    action: updates.is_active === false
      ? AUDIT_ACTIONS.DOCUMENT_TYPE_DEACTIVATED
      : AUDIT_ACTIONS.DOCUMENT_TYPE_UPDATED,
    entityType: 'document_type',
    entityId: id,
    metadata: updates,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, data: docType });
});

const remove = asyncWrapper(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = await db('document_types').where({ id }).first();
  if (!existing) throw new NotFoundError('Document type not found');

  const docCount = await db('documents')
    .where({ document_type_id: id }).whereNull('deleted_at').count('id as count').first();
  if (parseInt(docCount.count, 10) > 0) {
    throw new ConflictError('Cannot delete a document type that has associated documents');
  }

  await db('document_types').where({ id }).del();
  res.status(204).end();
});

module.exports = { list, create, update, remove };

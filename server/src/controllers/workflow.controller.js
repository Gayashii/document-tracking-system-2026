'use strict';

const db           = require('../config/db');
const auditService = require('../services/auditService');
const asyncWrapper = require('../utils/asyncWrapper');
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors');
const { AUDIT_ACTIONS } = require('../constants/auditActions');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchWorkflowWithSteps(id) {
  const workflow = await db('workflows').where({ id }).first();
  if (!workflow) throw new NotFoundError('Workflow not found');

  const steps = await db('workflow_steps as ws')
    .leftJoin('users as u', 'u.id', 'ws.assigned_user_id')
    .where('ws.workflow_id', id)
    .orderBy('ws.step_order')
    .select(
      'ws.id',
      'ws.step_order',
      'ws.phase_label',
      'ws.assigned_user_id',
      'u.email as assigned_user_email',
    );

  return { ...workflow, steps };
}

// ── List ──────────────────────────────────────────────────────────────────────

const list = asyncWrapper(async (req, res) => {
  const workflows = await db('workflows as w')
    .leftJoin('document_types as dt', 'dt.id', 'w.document_type_id')
    .select('w.id', 'w.name', 'w.document_type_id', 'dt.name as document_type_name', 'w.created_at')
    .orderBy('w.name');

  // Attach step counts
  const stepCounts = await db('workflow_steps')
    .whereIn('workflow_id', workflows.map((w) => w.id))
    .groupBy('workflow_id')
    .select('workflow_id', db.raw('count(*) as step_count'));

  const countMap = Object.fromEntries(stepCounts.map((r) => [r.workflow_id, parseInt(r.step_count)]));

  res.json({
    success: true,
    data: workflows.map((w) => ({ ...w, step_count: countMap[w.id] ?? 0 })),
  });
});

// ── Get single ────────────────────────────────────────────────────────────────

const getOne = asyncWrapper(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const workflow = await fetchWorkflowWithSteps(id);
  res.json({ success: true, data: workflow });
});

// ── Create ────────────────────────────────────────────────────────────────────

const create = asyncWrapper(async (req, res) => {
  const { name, document_type_id } = req.body;

  if (document_type_id) {
    const existing = await db('workflows').where({ document_type_id }).first();
    if (existing) throw new ConflictError('A workflow already exists for this document type');
  }

  const [workflow] = await db('workflows')
    .insert({ name, document_type_id: document_type_id || null })
    .returning('*');

  await auditService.log({
    actorId: req.user.id,
    action: AUDIT_ACTIONS.WORKFLOW_CREATED,
    entityType: 'workflow',
    entityId: workflow.id,
    metadata: { name, document_type_id },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(201).json({ success: true, data: { ...workflow, steps: [] } });
});

// ── Replace steps (bulk upsert) ───────────────────────────────────────────────

const replaceSteps = asyncWrapper(async (req, res) => {
  const id    = parseInt(req.params.id, 10);
  const steps = req.body.steps; // [{phase_label, assigned_user_id}] ordered array

  if (!Array.isArray(steps) || steps.length === 0) {
    throw new ValidationError('steps must be a non-empty array');
  }

  const workflow = await db('workflows').where({ id }).first();
  if (!workflow) throw new NotFoundError('Workflow not found');

  // Validate all assigned_user_ids exist and are finance_staff
  const userIds = [...new Set(steps.map((s) => s.assigned_user_id).filter(Boolean))];
  if (userIds.length) {
    const validUsers = await db('users')
      .whereIn('id', userIds)
      .where('role', 'finance_staff')
      .where('is_active', true)
      .select('id');
    const validSet = new Set(validUsers.map((u) => u.id));
    const invalid = userIds.filter((id) => !validSet.has(id));
    if (invalid.length) {
      throw new ValidationError(`User IDs are not active finance_staff: ${invalid.join(', ')}`);
    }
  }

  await db.transaction(async (trx) => {
    await trx('workflow_steps').where({ workflow_id: id }).del();

    const rows = steps.map((s, i) => ({
      workflow_id:      id,
      step_order:       i + 1,
      phase_label:      s.phase_label || `Phase ${i + 1}`,
      assigned_user_id: s.assigned_user_id || null,
    }));

    await trx('workflow_steps').insert(rows);
  });

  const updated = await fetchWorkflowWithSteps(id);

  await auditService.log({
    actorId: req.user.id,
    action: AUDIT_ACTIONS.WORKFLOW_UPDATED,
    entityType: 'workflow',
    entityId: id,
    metadata: { step_count: steps.length },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, data: updated });
});

// ── Update name ───────────────────────────────────────────────────────────────

const update = asyncWrapper(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, document_type_id } = req.body;

  const existing = await db('workflows').where({ id }).first();
  if (!existing) throw new NotFoundError('Workflow not found');

  if (document_type_id && document_type_id !== existing.document_type_id) {
    const conflict = await db('workflows').where({ document_type_id }).whereNot({ id }).first();
    if (conflict) throw new ConflictError('Another workflow already uses this document type');
  }

  const updates = {};
  if (name             != null) updates.name             = name;
  if (document_type_id != null) updates.document_type_id = document_type_id;

  const [workflow] = await db('workflows').where({ id }).update(updates).returning('*');

  await auditService.log({
    actorId: req.user.id,
    action: AUDIT_ACTIONS.WORKFLOW_UPDATED,
    entityType: 'workflow',
    entityId: id,
    metadata: updates,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, data: await fetchWorkflowWithSteps(workflow.id) });
});

// ── Delete ────────────────────────────────────────────────────────────────────

const remove = asyncWrapper(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = await db('workflows').where({ id }).first();
  if (!existing) throw new NotFoundError('Workflow not found');

  await db('workflows').where({ id }).del(); // CASCADE deletes steps

  await auditService.log({
    actorId: req.user.id,
    action: AUDIT_ACTIONS.WORKFLOW_DELETED,
    entityType: 'workflow',
    entityId: id,
    metadata: { name: existing.name },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(204).end();
});

module.exports = { list, getOne, create, update, replaceSteps, remove };

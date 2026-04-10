'use strict';

const db             = require('../config/db');
const auditService   = require('../services/auditService');
const asyncWrapper   = require('../utils/asyncWrapper');
const documentEvents = require('../events/documentEvents');
const { NotFoundError, ForbiddenError, ValidationError } = require('../utils/errors');
const { AUDIT_ACTIONS } = require('../constants/auditActions');
const { ROLES } = require('../constants/roles');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getDocument(id) {
  const doc = await db('documents as d')
    .leftJoin('document_types as dt', 'dt.id', 'd.document_type_id')
    .where('d.id', id)
    .whereNull('d.deleted_at')
    .select('d.*', 'dt.name as document_type_name')
    .first();
  if (!doc) throw new NotFoundError('Document not found');
  return doc;
}

async function getWorkflowForType(documentTypeId) {
  if (!documentTypeId) return null;
  const workflow = await db('workflows').where({ document_type_id: documentTypeId }).first();
  return workflow || null;
}

async function getStepsForWorkflow(workflowId) {
  return db('workflow_steps')
    .where({ workflow_id: workflowId })
    .orderBy('step_order')
    .select('*');
}

async function getPhaseLog(documentId) {
  return db('document_phase_log as pl')
    .leftJoin('workflow_steps as ws', 'ws.id', 'pl.workflow_step_id')
    .leftJoin('users as u', 'u.id', 'pl.actor_id')
    .where('pl.document_id', documentId)
    .orderBy('pl.created_at', 'asc')
    .select(
      'pl.id',
      'pl.action',
      'pl.note',
      'pl.created_at',
      'ws.phase_label',
      'ws.step_order',
      'u.email as actor_email',
    );
}

function assertIsAssignee(doc, user) {
  if (user.role === ROLES.ADMIN) return; // admin can always act
  if (doc.assigned_to_id !== user.id) {
    throw new ForbiddenError('You are not the current assignee of this document');
  }
}

// ── GET /documents/:id/phase ──────────────────────────────────────────────────

const getPhaseInfo = asyncWrapper(async (req, res) => {
  const id  = parseInt(req.params.id, 10);
  const doc = await getDocument(id);

  const workflow = await getWorkflowForType(doc.document_type_id);
  const steps    = workflow ? await getStepsForWorkflow(workflow.id) : [];
  const phaseLog = await getPhaseLog(id);

  // Current step detail
  let currentStep = null;
  if (doc.current_workflow_step_id) {
    currentStep = await db('workflow_steps as ws')
      .leftJoin('users as u', 'u.id', 'ws.assigned_user_id')
      .where('ws.id', doc.current_workflow_step_id)
      .select('ws.*', 'u.email as assigned_user_email')
      .first();
  }

  // Assigned staff detail
  let assignedTo = null;
  if (doc.assigned_to_id) {
    assignedTo = await db('users').where({ id: doc.assigned_to_id }).select('id', 'email', 'role').first();
  }

  res.json({
    success: true,
    data: {
      document_id:     id,
      status:          doc.status,
      assigned_to:     assignedTo,
      has_workflow:    !!workflow,
      workflow_id:     workflow?.id ?? null,
      total_steps:     steps.length,
      current_step:    currentStep,
      steps,
      phase_log:       phaseLog,
    },
  });
});

// ── POST /documents/:id/assign ────────────────────────────────────────────────

const assign = asyncWrapper(async (req, res) => {
  const id   = parseInt(req.params.id, 10);
  const doc  = await getDocument(id);
  const user = req.user;

  if (doc.status !== 'submitted') {
    throw new ValidationError('Only submitted documents can be assigned');
  }

  // If a workflow is defined for this document type, assignment is automatic on submission
  const workflow = await getWorkflowForType(doc.document_type_id);
  if (workflow) {
    throw new ValidationError(
      'This document type has a defined workflow — assignment is handled automatically on submission',
    );
  }

  // No workflow: staff self-assigns; admin must supply assigned_to_id
  let targetUserId;
  if (user.role === ROLES.ADMIN) {
    targetUserId = req.body.assigned_to_id;
    if (!targetUserId) throw new ValidationError('assigned_to_id is required');

    const target = await db('users').where({ id: targetUserId, role: ROLES.FINANCE_STAFF, is_active: true }).first();
    if (!target) throw new ValidationError('Target user must be an active finance_staff member');
  } else {
    targetUserId = user.id;
  }

  await db.transaction(async (trx) => {
    await trx('documents').where({ id }).update({
      assigned_to_id:           targetUserId,
      current_workflow_step_id: null,
      status:                   'pending_approval',
      updated_at:               trx.fn.now(),
    });

    await trx('document_phase_log').insert({
      document_id:      id,
      workflow_step_id: null,
      actor_id:         user.id,
      action:           'assigned',
      note:             req.body.note || null,
    });
  });

  await auditService.log({
    actorId: user.id,
    action: AUDIT_ACTIONS.DOCUMENT_ASSIGNED,
    entityType: 'document',
    entityId: id,
    metadata: { assigned_to_id: targetUserId },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, message: 'Document assigned.' });
});

// ── POST /documents/:id/phase/advance ─────────────────────────────────────────

const advance = asyncWrapper(async (req, res) => {
  const id   = parseInt(req.params.id, 10);
  const doc  = await getDocument(id);
  const user = req.user;

  if (doc.status !== 'pending_approval') {
    throw new ValidationError('Document is not in a pending state');
  }
  if (!doc.current_workflow_step_id) {
    throw new ValidationError('This document has no active workflow phase');
  }

  assertIsAssignee(doc, user);

  const workflow = await getWorkflowForType(doc.document_type_id);
  const steps    = await getStepsForWorkflow(workflow.id);
  const currentIdx = steps.findIndex((s) => s.id === doc.current_workflow_step_id);
  const current    = steps[currentIdx];

  if (currentIdx === steps.length - 1) {
    throw new ValidationError('This is the final phase. Use resolve to approve or reject.');
  }

  const nextStep = steps[currentIdx + 1];

  await db.transaction(async (trx) => {
    await trx('documents').where({ id }).update({
      assigned_to_id:           nextStep.assigned_user_id,
      current_workflow_step_id: nextStep.id,
      updated_at:               trx.fn.now(),
    });

    await trx('document_phase_log').insert({
      document_id:      id,
      workflow_step_id: nextStep.id,
      actor_id:         user.id,
      action:           'advanced',
      note:             req.body.note || null,
    });
  });

  await auditService.log({
    actorId: user.id,
    action: AUDIT_ACTIONS.DOCUMENT_PHASE_ADVANCED,
    entityType: 'document',
    entityId: id,
    metadata: { from_step: current.phase_label, to_step: nextStep.phase_label },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, message: `Advanced to phase "${nextStep.phase_label}".` });
});

// ── POST /documents/:id/phase/return ─────────────────────────────────────────

const returnPhase = asyncWrapper(async (req, res) => {
  const id   = parseInt(req.params.id, 10);
  const doc  = await getDocument(id);
  const user = req.user;

  if (doc.status !== 'pending_approval') {
    throw new ValidationError('Document is not in a pending state');
  }
  if (!doc.current_workflow_step_id) {
    throw new ValidationError('This document has no active workflow phase');
  }

  assertIsAssignee(doc, user);

  const workflow   = await getWorkflowForType(doc.document_type_id);
  const steps      = await getStepsForWorkflow(workflow.id);
  const currentIdx = steps.findIndex((s) => s.id === doc.current_workflow_step_id);

  if (currentIdx === 0) {
    throw new ValidationError('Cannot return from the first phase');
  }

  const current  = steps[currentIdx];
  const prevStep = steps[currentIdx - 1];

  await db.transaction(async (trx) => {
    await trx('documents').where({ id }).update({
      assigned_to_id:           prevStep.assigned_user_id,
      current_workflow_step_id: prevStep.id,
      updated_at:               trx.fn.now(),
    });

    await trx('document_phase_log').insert({
      document_id:      id,
      workflow_step_id: prevStep.id,
      actor_id:         user.id,
      action:           'returned',
      note:             req.body.note || null,
    });
  });

  await auditService.log({
    actorId: user.id,
    action: AUDIT_ACTIONS.DOCUMENT_PHASE_RETURNED,
    entityType: 'document',
    entityId: id,
    metadata: { from_step: current.phase_label, to_step: prevStep.phase_label },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, message: `Returned to phase "${prevStep.phase_label}".` });
});

// ── POST /documents/:id/phase/resolve ─────────────────────────────────────────

const resolve = asyncWrapper(async (req, res) => {
  const id       = parseInt(req.params.id, 10);
  const doc      = await getDocument(id);
  const user     = req.user;
  const decision = req.body.decision; // 'approved' | 'rejected'
  const note     = req.body.note;

  if (!['approved', 'rejected'].includes(decision)) {
    throw new ValidationError('decision must be "approved" or "rejected"');
  }
  if (decision === 'rejected' && !note?.trim()) {
    throw new ValidationError('A note is required when rejecting');
  }
  if (doc.status !== 'pending_approval') {
    throw new ValidationError('Document is not in a pending state');
  }

  // Resolve requires the actual assignee — admin cannot bypass the workflow here
  if (doc.assigned_to_id !== user.id) {
    throw new ForbiddenError('Only the current assignee can resolve this document');
  }

  // If workflow exists, must be on the final step
  if (doc.current_workflow_step_id) {
    const workflow = await getWorkflowForType(doc.document_type_id);
    const steps    = await getStepsForWorkflow(workflow.id);
    const currentIdx = steps.findIndex((s) => s.id === doc.current_workflow_step_id);
    if (currentIdx !== steps.length - 1) {
      throw new ValidationError('Only the final phase can resolve a document');
    }
  }

  await db.transaction(async (trx) => {
    await trx('documents').where({ id }).update({
      status:     decision,
      updated_at: trx.fn.now(),
    });

    await trx('document_phase_log').insert({
      document_id:      id,
      workflow_step_id: doc.current_workflow_step_id,
      actor_id:         user.id,
      action:           'resolved',
      note:             note || null,
    });

    await trx('document_status_history').insert({
      document_id: id,
      to_status:   decision,
      changed_by:  user.id,
      note:        note || null,
    });
  });

  await auditService.log({
    actorId: user.id,
    action: AUDIT_ACTIONS.DOCUMENT_PHASE_RESOLVED,
    entityType: 'document',
    entityId: id,
    metadata: { decision, note },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  documentEvents.emit('document.status_changed', {
    documentId: id,
    fromStatus: 'pending_approval',
    toStatus:   decision,
    actorId:    user.id,
    note:       note || null,
  });

  res.json({ success: true, message: `Document ${decision}.` });
});

module.exports = { getPhaseInfo, assign, advance, returnPhase, resolve };

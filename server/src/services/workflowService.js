'use strict';

const db = require('../config/db');
const auditService = require('./auditService');
const documentEvents = require('../events/documentEvents');
const { TRANSITIONS } = require('../constants/transitions');
const { AUDIT_ACTIONS } = require('../constants/auditActions');
const { WorkflowError, ForbiddenError, NotFoundError } = require('../utils/errors');

/**
 * Advance a document's status through the workflow state machine.
 *
 * @param {object} params
 * @param {number} params.documentId
 * @param {string} params.toStatus   Target status (must be a valid transition from current)
 * @param {object} params.actor      req.user — { id, role }
 * @param {string} [params.note]     Optional note recorded in status history
 * @param {string} [params.ipAddress]
 * @param {string} [params.userAgent]
 * @returns {Promise<object>} Updated document row
 */
async function transition({ documentId, toStatus, actor, note, ipAddress, userAgent }) {
  // 1. Fetch current document
  const doc = await db('documents')
    .where({ id: documentId })
    .whereNull('deleted_at')
    .first();

  if (!doc) throw new NotFoundError('Document not found');

  const fromStatus = doc.status;

  // 2. Look up allowed transitions from this status
  const available = TRANSITIONS[fromStatus] ?? [];
  const rule = available.find((t) => t.to === toStatus);

  if (!rule) {
    throw new WorkflowError(
      `Transition from '${fromStatus}' to '${toStatus}' is not allowed`,
    );
  }

  // 3. Role check
  if (!rule.allowedRoles.includes(actor.role)) {
    throw new ForbiddenError(
      `Role '${actor.role}' cannot perform the transition '${fromStatus}' → '${toStatus}'`,
    );
  }

  // 4. Atomic DB update
  const updatedDoc = await db.transaction(async (trx) => {
    const [updated] = await trx('documents')
      .where({ id: documentId })
      .update({ status: toStatus, updated_at: trx.fn.now() })
      .returning([
        'id', 'reference_number', 'title', 'document_type_id', 'department_id',
        'student_id', 'assigned_to_id', 'status', 'file_size', 'mime_type',
        'academic_year', 'semester', 'financial_amount', 'barcode_number',
        'version', 'created_at', 'updated_at',
      ]);

    await trx('document_status_history').insert({
      document_id: documentId,
      from_status: fromStatus,
      to_status: toStatus,
      changed_by: actor.id,
      note: note || null,
      ip_address: ipAddress || null,
    });

    await auditService.log(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.DOCUMENT_STATUS_CHANGED,
        entityType: 'document',
        entityId: documentId,
        metadata: { fromStatus, toStatus, note: note || null },
        ipAddress,
        userAgent,
      },
      trx,
    );

    return updated;
  });

  // 5. Emit event (after transaction commits — listeners handle notifications)
  documentEvents.emit('document.status_changed', {
    documentId,
    fromStatus,
    toStatus,
    actorId: actor.id,
    note: note || null,
  });

  return updatedDoc;
}

/**
 * Retrieve paginated status history for a document.
 *
 * @param {number} documentId
 * @returns {Promise<object[]>}
 */
async function getHistory(documentId) {
  return db('document_status_history as h')
    .join('users as u', 'u.id', 'h.changed_by')
    .where('h.document_id', documentId)
    .orderBy('h.created_at', 'asc')
    .select([
      'h.id',
      'h.from_status',
      'h.to_status',
      'h.note',
      'h.ip_address',
      'h.created_at',
      'u.id as changed_by_id',
      'u.email as changed_by_email',
      'u.role as changed_by_role',
    ]);
}

module.exports = { transition, getHistory };

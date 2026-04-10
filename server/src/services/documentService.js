'use strict';

const path = require('path');

const db = require('../config/db');
const documentModel = require('../models/document.model');
const storageService = require('./storageService');
const auditService = require('./auditService');
const { generateReferenceNumber } = require('../utils/referenceNumber');
const { generateBarcode } = require('../utils/barcode');
const { AUDIT_ACTIONS } = require('../constants/auditActions');
const { NotFoundError, ForbiddenError, ConflictError } = require('../utils/errors');
const { parsePagination, paginate } = require('../utils/paginate');
const { ROLES } = require('../constants/roles');
const documentEvents = require('../events/documentEvents');

async function uploadDocument({ file, body, user, ipAddress, userAgent }) {
  const { title, document_type_id, department_id, academic_year, semester, financial_amount } =
    body;

  const document = await db.transaction(async (trx) => {
    const referenceNumber = await generateReferenceNumber(trx);
    const barcodeNumber   = await generateBarcode(trx);

    const filePath = storageService.saveFile({
      buffer: file.buffer,
      referenceNumber,
      version: 1,
      originalName: file.originalname,
    });

    const [doc] = await documentModel.insert(
      {
        reference_number: referenceNumber,
        title,
        document_type_id,
        department_id,
        student_id: user.id,
        status: 'submitted',
        barcode_number: barcodeNumber,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.mimetype,
        academic_year: academic_year || null,
        semester: semester || null,
        financial_amount: financial_amount || null,
        version: 1,
      },
      trx,
    );

    await trx('document_status_history').insert({
      document_id: doc.id,
      from_status: null,
      to_status: 'submitted',
      changed_by: user.id,
      ip_address: ipAddress,
    });

    // Auto-assign to phase-1 staff if a workflow is defined for this document type
    if (document_type_id) {
      const workflow = await trx('workflows').where({ document_type_id }).first();
      if (workflow) {
        const firstStep = await trx('workflow_steps')
          .where({ workflow_id: workflow.id })
          .orderBy('step_order')
          .first();

        if (firstStep?.assigned_user_id) {
          await trx('documents').where({ id: doc.id }).update({
            assigned_to_id:           firstStep.assigned_user_id,
            current_workflow_step_id: firstStep.id,
            status:                   'pending_approval',
            updated_at:               trx.fn.now(),
          });

          await trx('document_status_history').insert({
            document_id: doc.id,
            from_status: 'submitted',
            to_status:   'pending_approval',
            changed_by:  user.id,
            ip_address:  ipAddress,
          });

          await trx('document_phase_log').insert({
            document_id:      doc.id,
            workflow_step_id: firstStep.id,
            actor_id:         user.id,
            action:           'assigned',
          });

          doc.status                   = 'pending_approval';
          doc.assigned_to_id           = firstStep.assigned_user_id;
          doc.current_workflow_step_id = firstStep.id;
        }
      }
    }

    await auditService.log(
      {
        actorId: user.id,
        action: AUDIT_ACTIONS.DOCUMENT_UPLOADED,
        entityType: 'document',
        entityId: doc.id,
        metadata: { referenceNumber, title },
        ipAddress,
        userAgent,
      },
      trx,
    );

    return doc;
  });

  documentEvents.emit('document.status_changed', {
    documentId: document.id,
    fromStatus: null,
    toStatus:   document.status, // 'submitted' or 'pending_approval' (auto-assigned workflow)
    actorId:    user.id,
    note:       null,
  });

  return document;
}

async function listDocuments({ query, user }) {
  const { page, limit, offset } = parsePagination(query);

  const filters = {};

  if (user.role === ROLES.STUDENT) {
    // Students may only see their own documents
    filters.student_id = user.id;
  } else {
    if (query.student_id) filters.student_id = parseInt(query.student_id, 10);
  }

  if (query.status) filters.status = query.status;
  if (query.department_id) filters.department_id = parseInt(query.department_id, 10);
  if (query.document_type_id) filters.document_type_id = parseInt(query.document_type_id, 10);
  if (query.academic_year) filters.academic_year = query.academic_year;
  if (query.reference_number) filters.reference_number = query.reference_number;

  const [documents, countRow] = await Promise.all([
    documentModel.findAll({ filters, limit, offset }),
    documentModel.countAll({ filters }),
  ]);

  return paginate(documents, parseInt(countRow.count, 10), page, limit);
}

async function getDocumentById({ id, user, ipAddress, userAgent }) {
  const doc = await documentModel.findById(id);
  if (!doc) throw new NotFoundError('Document not found');

  if (user.role === ROLES.STUDENT && doc.student_id !== user.id) {
    throw new ForbiddenError('Access denied');
  }

  await auditService.log({
    actorId: user.id,
    action: AUDIT_ACTIONS.DOCUMENT_VIEWED,
    entityType: 'document',
    entityId: doc.id,
    ipAddress,
    userAgent,
  });

  return doc;
}

async function downloadDocument({ id, user, ipAddress, userAgent }) {
  const doc = await documentModel.findById(id);
  if (!doc) throw new NotFoundError('Document not found');

  if (user.role === ROLES.STUDENT && doc.student_id !== user.id) {
    throw new ForbiddenError('Access denied');
  }

  await auditService.log({
    actorId: user.id,
    action: AUDIT_ACTIONS.DOCUMENT_DOWNLOADED,
    entityType: 'document',
    entityId: doc.id,
    ipAddress,
    userAgent,
  });

  return {
    absolutePath: storageService.resolvePath(doc.file_path),
    mimeType: doc.mime_type,
    filename: path.basename(doc.file_path),
  };
}

async function setBarcode({ id, barcodeNumber, user, ipAddress, userAgent }) {
  const doc = await documentModel.findById(id);
  if (!doc) throw new NotFoundError('Document not found');

  // Check uniqueness before hitting the DB constraint
  const existing = await db('documents')
    .where({ barcode_number: barcodeNumber })
    .whereNot({ id })
    .whereNull('deleted_at')
    .first();
  if (existing) throw new ConflictError(`Barcode number '${barcodeNumber}' is already assigned to another document`);

  const [updated] = await db('documents')
    .where({ id })
    .update({ barcode_number: barcodeNumber, updated_at: db.fn.now() })
    .returning(['id', 'reference_number', 'title', 'status', 'barcode_number', 'updated_at']);

  await auditService.log({
    actorId: user.id,
    action: AUDIT_ACTIONS.DOCUMENT_BARCODE_SET,
    entityType: 'document',
    entityId: id,
    metadata: { barcodeNumber },
    ipAddress,
    userAgent,
  });

  return updated;
}

async function createVersion({ id, file, actor, changeNote, ipAddress, userAgent }) {
  const doc = await documentModel.findById(id);
  if (!doc) throw new NotFoundError('Document not found');

  if (doc.status !== 'rejected') {
    const { WorkflowError } = require('../utils/errors');
    throw new WorkflowError('A new version can only be submitted after a rejection');
  }

  if (doc.student_id !== actor.id) {
    throw new ForbiddenError('Only the document owner may re-submit');
  }

  const newVersion = doc.version + 1;

  const newFilePath = storageService.saveFile({
    buffer: file.buffer,
    referenceNumber: doc.reference_number,
    version: newVersion,
    originalName: file.originalname,
  });

  const updatedDoc = await db.transaction(async (trx) => {
    // Archive the current version
    await trx('document_versions').insert({
      document_id: doc.id,
      version_number: doc.version,
      file_path: doc.file_path,
      uploaded_by: actor.id,
      change_note: changeNote || null,
    });

    // Check for a workflow to determine the reset state
    const workflow = doc.document_type_id
      ? await trx('workflows').where({ document_type_id: doc.document_type_id }).first()
      : null;
    const firstStep = workflow
      ? await trx('workflow_steps').where({ workflow_id: workflow.id }).orderBy('step_order').first()
      : null;

    const resetStatus    = firstStep?.assigned_user_id ? 'pending_approval' : 'submitted';
    const resetAssignee  = firstStep?.assigned_user_id ?? null;
    const resetStepId    = firstStep?.id ?? null;

    // Advance the document to the new version and reset to start of workflow
    const [updated] = await trx('documents')
      .where({ id: doc.id })
      .update({
        file_path:                newFilePath,
        file_size:                file.size,
        mime_type:                file.mimetype,
        version:                  newVersion,
        status:                   resetStatus,
        assigned_to_id:           resetAssignee,
        current_workflow_step_id: resetStepId,
        updated_at:               trx.fn.now(),
      })
      .returning([
        'id', 'reference_number', 'title', 'document_type_id', 'department_id',
        'student_id', 'assigned_to_id', 'current_workflow_step_id', 'status',
        'file_size', 'mime_type', 'academic_year', 'semester', 'financial_amount',
        'barcode_number', 'version', 'created_at', 'updated_at',
      ]);

    await trx('document_status_history').insert({
      document_id: doc.id,
      from_status: 'rejected',
      to_status:   resetStatus,
      changed_by:  actor.id,
      note:        `Re-submission v${newVersion}`,
      ip_address:  ipAddress || null,
    });

    if (resetStepId) {
      await trx('document_phase_log').insert({
        document_id:      doc.id,
        workflow_step_id: resetStepId,
        actor_id:         actor.id,
        action:           'assigned',
        note:             `Re-submission v${newVersion}`,
      });
    }

    await auditService.log(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.DOCUMENT_VERSION_CREATED,
        entityType: 'document',
        entityId: doc.id,
        metadata: { newVersion, referenceNumber: doc.reference_number, resetStatus },
        ipAddress,
        userAgent,
      },
      trx,
    );

    return updated;
  });

  documentEvents.emit('document.status_changed', {
    documentId: doc.id,
    fromStatus: 'rejected',
    toStatus:   updatedDoc.status,
    actorId:    actor.id,
    note:       `Re-submission v${updatedDoc.version}`,
  });

  return updatedDoc;
}

async function listVersions({ id, actor }) {
  const doc = await documentModel.findById(id);
  if (!doc) throw new NotFoundError('Document not found');

  if (actor.role === ROLES.STUDENT && doc.student_id !== actor.id) {
    throw new ForbiddenError('Access denied');
  }

  return db('document_versions as v')
    .join('users as u', 'u.id', 'v.uploaded_by')
    .where('v.document_id', id)
    .orderBy('v.version_number', 'asc')
    .select([
      'v.id',
      'v.version_number',
      'v.file_path',
      'v.change_note',
      'v.created_at',
      'u.id as uploaded_by_id',
      'u.email as uploaded_by_email',
    ]);
}

async function getVersion({ id, versionId, actor }) {
  const doc = await documentModel.findById(id);
  if (!doc) throw new NotFoundError('Document not found');

  if (actor.role === ROLES.STUDENT && doc.student_id !== actor.id) {
    throw new ForbiddenError('Access denied');
  }

  const version = await db('document_versions')
    .where({ id: versionId, document_id: id })
    .first();

  if (!version) throw new NotFoundError('Version not found');

  return version;
}

async function search(filters, actor) {
  const { page, limit, offset } = parsePagination(filters);

  const SEARCH_COLS = [
    'd.id',
    'd.reference_number',
    'd.title',
    'd.document_type_id',
    'dt.name as document_type_name',
    'd.department_id',
    'd.student_id',
    'd.assigned_to_id',
    'd.current_workflow_step_id',
    'd.status',
    'd.file_size',
    'd.mime_type',
    'd.academic_year',
    'd.semester',
    'd.financial_amount',
    'd.barcode_number',
    'd.version',
    'd.created_at',
    'd.updated_at',
  ];

  const base = db('documents as d')
    .leftJoin('document_types as dt', 'dt.id', 'd.document_type_id')
    .whereNull('d.deleted_at');

  // Role scoping — students always see only their own documents
  if (actor.role === ROLES.STUDENT) {
    base.where('d.student_id', actor.id);
  } else if (filters.student_id) {
    base.where('d.student_id', parseInt(filters.student_id, 10));
  }

  // Full-text search
  if (filters.q) {
    base.whereRaw("d.search_vector @@ plainto_tsquery('english', ?)", [filters.q]);
  }

  // Document type
  if (filters.type) base.where('d.document_type_id', parseInt(filters.type, 10));

  // Status — accepts single value or comma-separated list
  if (filters.status) {
    const statuses = String(filters.status).split(',').map((s) => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      base.where('d.status', statuses[0]);
    } else {
      base.whereIn('d.status', statuses);
    }
  }

  // Date range on created_at
  if (filters.from) base.where('d.created_at', '>=', new Date(filters.from));
  if (filters.to) {
    const to = new Date(filters.to);
    to.setHours(23, 59, 59, 999);
    base.where('d.created_at', '<=', to);
  }

  // Financial amount range
  if (filters.amount_min != null && filters.amount_min !== '') {
    base.where('d.financial_amount', '>=', parseFloat(filters.amount_min));
  }
  if (filters.amount_max != null && filters.amount_max !== '') {
    base.where('d.financial_amount', '<=', parseFloat(filters.amount_max));
  }

  // Department
  if (filters.department_id) base.where('d.department_id', parseInt(filters.department_id, 10));

  const [rows, countRow] = await Promise.all([
    base.clone().select(SEARCH_COLS).orderBy('d.created_at', 'desc').limit(limit).offset(offset),
    base.clone().count('d.id as count').first(),
  ]);

  return {
    ...paginate(rows, parseInt(countRow.count, 10), page, limit),
    meta: { filters },
  };
}

async function deleteDocument({ id, user, ipAddress, userAgent }) {
  const doc = await documentModel.findById(id);
  if (!doc) throw new NotFoundError('Document not found');

  await db('documents')
    .where({ id })
    .update({ deleted_at: db.fn.now() });

  await auditService.log({
    actorId: user.id,
    action: AUDIT_ACTIONS.DOCUMENT_DELETED,
    entityType: 'document',
    entityId: id,
    metadata: { referenceNumber: doc.reference_number, title: doc.title },
    ipAddress,
    userAgent,
  });
}

module.exports = {
  uploadDocument,
  listDocuments,
  getDocumentById,
  downloadDocument,
  setBarcode,
  search,
  createVersion,
  listVersions,
  getVersion,
  deleteDocument,
};

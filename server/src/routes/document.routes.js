'use strict';

const express = require('express');
const router = express.Router();

const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { upload: multerUpload, validateMagicBytes } = require('../middleware/uploadHandler');
const { generalLimiter } = require('../middleware/rateLimiter');
const controller      = require('../controllers/document.controller');
const phaseController = require('../controllers/documentPhase.controller');
const {
  uploadBodySchema,
  listQuerySchema,
  idParamSchema,
  barcodeSchema,
  statusUpdateSchema,
  historyQuerySchema,
  versionBodySchema,
  versionParamSchema,
  searchQuerySchema,
} = require('../validators/document.validators');
const { PERMISSIONS } = require('../constants/roles');

// All routes require authentication
router.use(authenticate);
router.use(generalLimiter);

// POST / — upload a new document (multipart/form-data, field name: "file")
router.post(
  '/',
  authorize(PERMISSIONS.DOCUMENT_UPLOAD),
  multerUpload.single('file'),
  validateMagicBytes,
  validate(uploadBodySchema, 'body'),
  controller.upload,
);

// GET / — list documents (paginated + filtered)
router.get(
  '/',
  authorize([...PERMISSIONS.DOCUMENT_READ_ANY, ...PERMISSIONS.DOCUMENT_READ_OWN]),
  validate(listQuerySchema, 'query'),
  controller.list,
);

// GET /search — advanced multi-criteria search (must precede /:id)
router.get(
  '/search',
  authorize([...PERMISSIONS.DOCUMENT_READ_ANY, ...PERMISSIONS.DOCUMENT_READ_OWN]),
  validate(searchQuerySchema, 'query'),
  controller.search,
);

// GET /:id — get document metadata
router.get(
  '/:id',
  authorize([...PERMISSIONS.DOCUMENT_READ_ANY, ...PERMISSIONS.DOCUMENT_READ_OWN]),
  validate(idParamSchema, 'params'),
  controller.getById,
);

// GET /:id/download — stream the file
router.get(
  '/:id/download',
  authorize([...PERMISSIONS.DOCUMENT_READ_ANY, ...PERMISSIONS.DOCUMENT_READ_OWN]),
  validate(idParamSchema, 'params'),
  controller.download,
);

// PATCH /:id/barcode — assign or update barcode number (finance_staff, admin)
router.patch(
  '/:id/barcode',
  authorize(PERMISSIONS.WORKFLOW_ADVANCE),
  validate(idParamSchema, 'params'),
  validate(barcodeSchema, 'body'),
  controller.setBarcode,
);

// PATCH /:id/status — advance workflow status
router.patch(
  '/:id/status',
  authorize(PERMISSIONS.DOCUMENT_STATUS_CHANGE),
  validate(idParamSchema, 'params'),
  validate(statusUpdateSchema, 'body'),
  controller.changeStatus,
);

// POST /:id/versions — re-submit a new file version after rejection (student, own document)
router.post(
  '/:id/versions',
  authorize(PERMISSIONS.DOCUMENT_VERSION_CREATE),
  multerUpload.single('file'),
  validateMagicBytes,
  validate(idParamSchema, 'params'),
  validate(versionBodySchema, 'body'),
  controller.createVersion,
);

// GET /:id/versions — list all archived versions
router.get(
  '/:id/versions',
  authorize(PERMISSIONS.DOCUMENT_VERSION_READ),
  validate(idParamSchema, 'params'),
  controller.listVersions,
);

// GET /:id/versions/:versionId/download — download an archived version file
router.get(
  '/:id/versions/:versionId/download',
  authorize(PERMISSIONS.DOCUMENT_VERSION_READ),
  validate(versionParamSchema, 'params'),
  controller.downloadVersion,
);

// DELETE /:id — soft delete (admin only)
router.delete(
  '/:id',
  authorize(PERMISSIONS.DOCUMENT_DELETE),
  validate(idParamSchema, 'params'),
  controller.remove,
);

// GET /:id/history — paginated status change history
router.get(
  '/:id/history',
  authorize([...PERMISSIONS.DOCUMENT_READ_ANY, ...PERMISSIONS.DOCUMENT_READ_OWN]),
  validate(idParamSchema, 'params'),
  validate(historyQuerySchema, 'query'),
  controller.getHistory,
);

// ── Phase-based workflow routes ───────────────────────────────────────────────

// GET /:id/phase — current phase info + log
router.get(
  '/:id/phase',
  authorize([...PERMISSIONS.DOCUMENT_READ_ANY, ...PERMISSIONS.DOCUMENT_READ_OWN]),
  validate(idParamSchema, 'params'),
  phaseController.getPhaseInfo,
);

// POST /:id/assign — self-assign (staff) or assign to staff (admin)
router.post(
  '/:id/assign',
  authorize(PERMISSIONS.DOCUMENT_ASSIGN),
  validate(idParamSchema, 'params'),
  phaseController.assign,
);

// POST /:id/phase/advance — push to next phase
router.post(
  '/:id/phase/advance',
  authorize(PERMISSIONS.DOCUMENT_PHASE_ACTION),
  validate(idParamSchema, 'params'),
  phaseController.advance,
);

// POST /:id/phase/return — send back to previous phase
router.post(
  '/:id/phase/return',
  authorize(PERMISSIONS.DOCUMENT_PHASE_ACTION),
  validate(idParamSchema, 'params'),
  phaseController.returnPhase,
);

// POST /:id/phase/resolve — final phase: approve or reject
router.post(
  '/:id/phase/resolve',
  authorize(PERMISSIONS.DOCUMENT_PHASE_ACTION),
  validate(idParamSchema, 'params'),
  phaseController.resolve,
);

module.exports = router;

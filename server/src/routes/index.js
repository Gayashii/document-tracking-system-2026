'use strict';

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const asyncWrapper = require('../utils/asyncWrapper');
const { scanLimiter } = require('../middleware/rateLimiter');

// ── Health check ──────────────────────────────────────────────────────────────
router.get(
  '/health',
  asyncWrapper(async (req, res) => {
    let dbStatus = 'ok';
    try {
      await db.raw('SELECT 1');
    } catch {
      dbStatus = 'error';
    }

    const storageStatus = 'ok';

    const status = dbStatus === 'ok' ? 'ok' : 'degraded';

    res.status(status === 'ok' ? 200 : 503).json({
      status,
      db: dbStatus,
      storage: storageStatus,
      timestamp: new Date().toISOString(),
    });
  }),
);

// ── Feature routes ────────────────────────────────────────────────────────────
router.use('/auth',           require('./auth.routes'));
router.use('/users',          require('./user.routes'));
router.use('/documents',      require('./document.routes'));
router.use('/departments',    require('./department.routes'));
router.use('/document-types', require('./documentType.routes'));
router.use('/settings',       require('./settings.routes'));

// ── Lookup endpoints (document types + departments) ───────────────────────────
const authenticate = require('../middleware/authenticate');

router.get('/lookups/document-types', authenticate, asyncWrapper(async (req, res) => {
  const rows = await db('document_types').where({ is_active: true }).orderBy('name');
  res.json({ success: true, data: rows });
}));

router.get('/lookups/departments', authenticate, asyncWrapper(async (req, res) => {
  const rows = await db('departments').orderBy('name');
  res.json({ success: true, data: rows });
}));
// ── Public barcode scan lookup (no auth) ──────────────────────────────────────
router.get('/scan', scanLimiter, asyncWrapper(async (req, res) => {
  const code = (req.query.code || '').toString().trim();
  if (!code) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Query parameter "code" is required' } });
  }

  const doc = await db('documents as d')
    .join('document_types as dt', 'dt.id', 'd.document_type_id')
    .where('d.barcode_number', code)
    .whereNull('d.deleted_at')
    .select('d.id', 'd.reference_number', 'd.title', 'd.status', 'd.updated_at', 'dt.name as document_type')
    .first();

  if (!doc) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'No document found for this barcode' } });
  }

  res.json({ success: true, data: doc });
}));

router.use('/workflows',     require('./workflow.routes'));
router.use('/notifications', require('./notification.routes'));
router.use('/reports',       require('./report.routes'));
router.use('/audit',         require('./audit.routes'));

module.exports = router;

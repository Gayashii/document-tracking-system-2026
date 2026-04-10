'use strict';

const express    = require('express');
const router     = express.Router();
const authenticate    = require('../middleware/authenticate');
const authorize       = require('../middleware/authorize');
const { generalLimiter, exportLimiter } = require('../middleware/rateLimiter');
const controller      = require('../controllers/audit.controller');
const { PERMISSIONS } = require('../constants/roles');

router.use(authenticate);

// GET /audit — paginated, filterable audit log
router.get('/',                     generalLimiter, authorize(PERMISSIONS.AUDIT_VIEW), controller.list);

// GET /audit/export — CSV download (rate-limited)
router.get('/export',               exportLimiter,  authorize(PERMISSIONS.AUDIT_VIEW), controller.exportCsv);

// GET /audit/entity/:type/:id — all events for one entity
router.get('/entity/:type/:id',     generalLimiter, authorize(PERMISSIONS.AUDIT_VIEW), controller.entityHistory);

module.exports = router;

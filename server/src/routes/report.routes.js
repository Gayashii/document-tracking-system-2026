'use strict';

const express = require('express');
const router  = express.Router();

const authenticate         = require('../middleware/authenticate');
const authorize            = require('../middleware/authorize');
const { exportLimiter, generalLimiter } = require('../middleware/rateLimiter');
const controller           = require('../controllers/report.controller');
const { PERMISSIONS }      = require('../constants/roles');

router.use(authenticate);

// GET /pending — submitted + pending_approval documents
router.get('/pending',    generalLimiter, authorize(PERMISSIONS.REPORT_VIEW), controller.pending);

// GET /history — full document lifecycle
router.get('/history',    generalLimiter, authorize(PERMISSIONS.AUDIT_VIEW),  controller.history);

// GET /statistics — aggregated counts
router.get('/statistics', generalLimiter, authorize(PERMISSIONS.REPORT_VIEW), controller.statistics);

// GET /overdue — pending_approval for > N days
router.get('/overdue',    generalLimiter, authorize(PERMISSIONS.REPORT_VIEW), controller.overdue);

// GET /export?report=pending|history|overdue&format=csv|xlsx|pdf
router.get('/export',     exportLimiter,  authorize(PERMISSIONS.REPORT_VIEW), controller.exportReport);

module.exports = router;

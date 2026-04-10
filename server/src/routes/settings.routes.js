'use strict';

const express  = require('express');
const router   = express.Router();
const authenticate    = require('../middleware/authenticate');
const authorize       = require('../middleware/authorize');
const { generalLimiter } = require('../middleware/rateLimiter');
const controller      = require('../controllers/settings.controller');
const { PERMISSIONS } = require('../constants/roles');

router.use(authenticate, generalLimiter);

router.get('/',   authorize(PERMISSIONS.SETTINGS_MANAGE), controller.getAll);
router.patch('/', authorize(PERMISSIONS.SETTINGS_MANAGE), controller.patch);

module.exports = router;

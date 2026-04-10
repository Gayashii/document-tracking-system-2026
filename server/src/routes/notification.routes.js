'use strict';

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { PERMISSIONS } = require('../constants/roles');
const controller = require('../controllers/notification.controller');

router.use(authenticate);
router.use(authorize(PERMISSIONS.NOTIFICATION_VIEW));

router.get('/mine',           controller.mine);
router.get('/unread-count',   controller.unreadCount);
router.patch('/read-all',     controller.markAllRead);
router.patch('/:id/read',     controller.markRead);

module.exports = router;

'use strict';

const db = require('../config/db');
const asyncWrapper = require('../utils/asyncWrapper');
const { parsePagination, paginate } = require('../utils/paginate');
const { NotFoundError } = require('../utils/errors');

/** GET /notifications/mine — paginated in-app notifications, unread (pending) first */
const mine = asyncWrapper(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const userId = req.user.id;

  const [rows, countRow] = await Promise.all([
    db('notifications')
      .where({ recipient_id: userId, type: 'in_app' })
      .orderByRaw(`CASE WHEN status = 'pending' THEN 0 ELSE 1 END`)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .select('id', 'subject', 'body', 'status', 'sent_at', 'created_at'),
    db('notifications')
      .where({ recipient_id: userId, type: 'in_app' })
      .count('id as count')
      .first(),
  ]);

  res.json({ success: true, ...paginate(rows, parseInt(countRow.count, 10), page, limit) });
});

/** GET /notifications/unread-count — count of unread in-app notifications */
const unreadCount = asyncWrapper(async (req, res) => {
  const row = await db('notifications')
    .where({ recipient_id: req.user.id, type: 'in_app', status: 'pending' })
    .count('id as count')
    .first();
  res.json({ success: true, data: { count: parseInt(row.count, 10) } });
});

/** PATCH /notifications/:id/read — mark single in-app notification as read */
const markRead = asyncWrapper(async (req, res) => {
  const notif = await db('notifications')
    .where({ id: parseInt(req.params.id, 10), recipient_id: req.user.id, type: 'in_app' })
    .first();

  if (!notif) throw new NotFoundError('Notification not found');

  await db('notifications')
    .where({ id: notif.id })
    .update({ status: 'sent', sent_at: db.fn.now() });

  res.json({ success: true });
});

/** PATCH /notifications/read-all — mark all unread in-app notifications as read */
const markAllRead = asyncWrapper(async (req, res) => {
  await db('notifications')
    .where({ recipient_id: req.user.id, type: 'in_app', status: 'pending' })
    .update({ status: 'sent', sent_at: db.fn.now() });

  res.json({ success: true });
});

module.exports = { mine, unreadCount, markRead, markAllRead };

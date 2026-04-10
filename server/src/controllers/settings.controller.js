'use strict';

const db = require('../config/db');
const auditService = require('../services/auditService');
const asyncWrapper = require('../utils/asyncWrapper');
const { AUDIT_ACTIONS } = require('../constants/auditActions');

const DEFAULTS = {
  max_file_size_mb:           '10',
  allowed_mime_types:         'application/pdf,image/jpeg,image/png',
  session_timeout_minutes:    '60',
  overdue_threshold_days:     '5',
  mfa_required_roles:         'admin,finance_staff',
  email_notifications_enabled:'true',
};

const getAll = asyncWrapper(async (req, res) => {
  const rows = await db('system_settings').select('key', 'value', 'updated_by', 'updated_at');
  const map = { ...DEFAULTS };
  const meta = {};

  for (const row of rows) {
    map[row.key] = row.value;
    meta[row.key] = { updated_by: row.updated_by, updated_at: row.updated_at };
  }

  // Resolve updated_by user email
  const actorIds = [...new Set(Object.values(meta).map((m) => m.updated_by).filter(Boolean))];
  let actorMap = {};
  if (actorIds.length) {
    const actors = await db('users').whereIn('id', actorIds).select('id', 'email');
    actorMap = Object.fromEntries(actors.map((a) => [a.id, a.email]));
  }

  const data = Object.entries(map).map(([key, value]) => ({
    key,
    value,
    updated_by_email: meta[key] ? (actorMap[meta[key].updated_by] ?? null) : null,
    updated_at:       meta[key]?.updated_at ?? null,
  }));

  res.json({ success: true, data });
});

const patch = asyncWrapper(async (req, res) => {
  const incoming = req.body.settings;
  if (!incoming || typeof incoming !== 'object' || !Object.keys(incoming).length) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No settings provided.' } });
  }

  // Reject unknown keys
  const unknownKeys = Object.keys(incoming).filter((k) => !(k in DEFAULTS));
  if (unknownKeys.length) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: `Unknown setting key(s): ${unknownKeys.join(', ')}` },
    });
  }

  const now = new Date();
  for (const [key, value] of Object.entries(incoming)) {
    await db('system_settings')
      .insert({ key, value: String(value), updated_by: req.user.id, updated_at: now })
      .onConflict('key')
      .merge({ value: String(value), updated_by: req.user.id, updated_at: now });
  }

  await auditService.log({
    actorId: req.user.id,
    action: AUDIT_ACTIONS.DEPARTMENT_UPDATED,
    entityType: 'system_settings',
    entityId: null,
    metadata: incoming,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Return updated settings list (same shape as getAll)
  const rows = await db('system_settings').select('key', 'value', 'updated_by', 'updated_at');
  const map = { ...DEFAULTS };
  const meta = {};
  for (const row of rows) { map[row.key] = row.value; meta[row.key] = { updated_by: row.updated_by, updated_at: row.updated_at }; }

  const actorIds = [...new Set(Object.values(meta).map((m) => m.updated_by).filter(Boolean))];
  let actorMap = {};
  if (actorIds.length) {
    const actors = await db('users').whereIn('id', actorIds).select('id', 'email');
    actorMap = Object.fromEntries(actors.map((a) => [a.id, a.email]));
  }

  const data = Object.entries(map).map(([key, value]) => ({
    key,
    value,
    updated_by_email: meta[key] ? (actorMap[meta[key].updated_by] ?? null) : null,
    updated_at:       meta[key]?.updated_at ?? null,
  }));

  res.json({ success: true, data });
});

module.exports = { getAll, patch };

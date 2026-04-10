'use strict';

const db = require('../config/db');
const { parsePagination, paginate } = require('../utils/paginate');

/**
 * Append an immutable audit log entry.
 * The DB user has no UPDATE/DELETE on audit_logs — this table is append-only.
 *
 * @param {object} params
 * @param {number|null}  params.actorId
 * @param {string}       params.action       One of AUDIT_ACTIONS
 * @param {string}       params.entityType
 * @param {number|null}  [params.entityId]
 * @param {object|null}  [params.metadata]
 * @param {string|null}  [params.ipAddress]
 * @param {string|null}  [params.userAgent]
 * @param {import('knex').Knex.Transaction} [trx]
 */
async function log(
  {
    actorId,
    action,
    entityType,
    entityId = null,
    metadata = null,
    ipAddress = null,
    userAgent = null,
  },
  trx,
) {
  const qb = trx || db;
  await qb('audit_logs').insert({
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata: metadata ? JSON.stringify(metadata) : null,
    ip_address: ipAddress,
    user_agent: userAgent,
  });
}

/**
 * Paginated query on audit_logs with optional filters.
 * Joins users to resolve actor details.
 *
 * @param {object} filters  - Query params (actor_id, entity_type, entity_id, action, from, to, page, limit)
 * @returns {{ data, pagination }}
 */
async function query(filters = {}) {
  const { page, limit, offset } = parsePagination(filters);

  const base = db('audit_logs as al')
    .leftJoin('users as u', 'u.id', 'al.actor_id')
    .select([
      'al.id',
      'al.action',
      'al.entity_type',
      'al.entity_id',
      'al.metadata',
      'al.ip_address',
      'al.user_agent',
      'al.created_at',
      'u.id as actor_id',
      'u.email as actor_email',
      'u.role as actor_role',
    ])
    .orderBy('al.created_at', 'desc');

  if (filters.actor_id)    base.where('al.actor_id',    parseInt(filters.actor_id, 10));
  if (filters.entity_type) base.where('al.entity_type', filters.entity_type);
  if (filters.entity_id)   base.where('al.entity_id',   parseInt(filters.entity_id, 10));
  if (filters.action)      base.where('al.action',      filters.action);
  if (filters.from) base.where('al.created_at', '>=', new Date(filters.from));
  if (filters.to) {
    const to = new Date(filters.to);
    to.setHours(23, 59, 59, 999);
    base.where('al.created_at', '<=', to);
  }
  // Actor email search (partial)
  if (filters.actor_email) {
    base.where('u.email', 'ilike', `%${filters.actor_email}%`);
  }

  const [rows, countRow] = await Promise.all([
    base.clone().limit(limit).offset(offset),
    base.clone().clearSelect().clearOrder().count('al.id as count').first(),
  ]);

  return paginate(rows, parseInt(countRow.count, 10), page, limit);
}

/**
 * All audit entries for a specific entity (e.g. document #42).
 * Used by document detail "View Audit History" shortcut.
 */
async function getEntityHistory(entityType, entityId) {
  return db('audit_logs as al')
    .leftJoin('users as u', 'u.id', 'al.actor_id')
    .where('al.entity_type', entityType)
    .where('al.entity_id', parseInt(entityId, 10))
    .select([
      'al.id',
      'al.action',
      'al.entity_type',
      'al.entity_id',
      'al.metadata',
      'al.ip_address',
      'al.user_agent',
      'al.created_at',
      'u.id as actor_id',
      'u.email as actor_email',
      'u.role as actor_role',
    ])
    .orderBy('al.created_at', 'desc');
}

module.exports = { log, query, getEntityHistory };

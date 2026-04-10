'use strict';

const db = require('../config/db');
const { ROLES } = require('../constants/roles');

const DEFAULT_OVERDUE_DAYS = 7;

/**
 * Apply role-based department scoping.
 * Finance staff only see their own department when a department_id is set
 * on their user record.  Admin / auditor see everything.
 */
async function applyRoleScope(qb, actor, tableAlias = 'd') {
  if (actor.role === ROLES.FINANCE_STAFF) {
    const user = await db('users').where({ id: actor.id }).first();
    if (user && user.department_id) {
      qb.where(`${tableAlias}.department_id`, user.department_id);
    }
  }
}

// ─── Pending report ──────────────────────────────────────────────────────────

async function getPendingReport(filters, actor) {
  const qb = db('documents as d')
    .join('document_types as dt', 'dt.id', 'd.document_type_id')
    .join('departments as dep', 'dep.id', 'd.department_id')
    .join('users as u', 'u.id', 'd.student_id')
    .whereIn('d.status', ['submitted', 'pending_approval'])
    .whereNull('d.deleted_at')
    .select([
      'd.id',
      'd.reference_number',
      'd.title',
      'dt.name as document_type',
      'dep.name as department',
      'u.email as student_email',
      'd.status',
      'd.created_at as submitted_at',
      db.raw("EXTRACT(EPOCH FROM (NOW() - d.created_at)) / 86400 AS days_pending"),
    ])
    .orderBy('d.created_at', 'asc');

  await applyRoleScope(qb, actor);
  if (filters.department_id) qb.where('d.department_id', parseInt(filters.department_id, 10));
  if (filters.from) qb.where('d.created_at', '>=', new Date(filters.from));
  if (filters.to) {
    const to = new Date(filters.to); to.setHours(23, 59, 59, 999);
    qb.where('d.created_at', '<=', to);
  }

  const rows = await qb;
  return rows.map((r) => ({
    ...r,
    days_pending: Math.floor(parseFloat(r.days_pending ?? 0)),
  }));
}

// ─── History report ──────────────────────────────────────────────────────────

async function getHistoryReport(filters, actor) {
  const qb = db('documents as d')
    .join('document_types as dt', 'dt.id', 'd.document_type_id')
    .join('departments as dep', 'dep.id', 'd.department_id')
    .join('users as u', 'u.id', 'd.student_id')
    .join('document_status_history as h', 'h.document_id', 'd.id')
    .leftJoin('users as actor_u', 'actor_u.id', 'h.changed_by')
    .whereNull('d.deleted_at')
    .select([
      'd.id as document_id',
      'd.reference_number',
      'd.title',
      'dt.name as document_type',
      'dep.name as department',
      'u.email as student_email',
      'h.from_status',
      'h.to_status',
      'h.note',
      'h.created_at as changed_at',
      'actor_u.email as changed_by_email',
      'actor_u.role as changed_by_role',
    ])
    .orderBy('d.id', 'asc')
    .orderBy('h.created_at', 'asc');

  await applyRoleScope(qb, actor);
  if (filters.department_id) qb.where('d.department_id', parseInt(filters.department_id, 10));
  if (filters.from) qb.where('d.created_at', '>=', new Date(filters.from));
  if (filters.to) {
    const to = new Date(filters.to); to.setHours(23, 59, 59, 999);
    qb.where('d.created_at', '<=', to);
  }

  return qb;
}

// ─── Statistics report ───────────────────────────────────────────────────────

async function getStatisticsReport(filters, actor) {
  // Counts by status
  const byStatusQb = db('documents as d')
    .whereNull('d.deleted_at')
    .select('d.status')
    .count('d.id as count')
    .groupBy('d.status');
  await applyRoleScope(byStatusQb, actor);
  if (filters.department_id) byStatusQb.where('d.department_id', parseInt(filters.department_id, 10));

  // Counts by document type
  const byTypeQb = db('documents as d')
    .join('document_types as dt', 'dt.id', 'd.document_type_id')
    .whereNull('d.deleted_at')
    .select('dt.name as document_type')
    .count('d.id as count')
    .groupBy('dt.name')
    .orderBy('count', 'desc');
  await applyRoleScope(byTypeQb, actor);
  if (filters.department_id) byTypeQb.where('d.department_id', parseInt(filters.department_id, 10));

  // Counts by department
  const byDeptQb = db('documents as d')
    .join('departments as dep', 'dep.id', 'd.department_id')
    .whereNull('d.deleted_at')
    .select('dep.name as department')
    .count('d.id as count')
    .groupBy('dep.name')
    .orderBy('count', 'desc');
  await applyRoleScope(byDeptQb, actor);
  if (filters.department_id) byDeptQb.where('d.department_id', parseInt(filters.department_id, 10));

  // Counts by academic year
  const byYearQb = db('documents as d')
    .whereNull('d.deleted_at')
    .whereNotNull('d.academic_year')
    .select('d.academic_year')
    .count('d.id as count')
    .groupBy('d.academic_year')
    .orderBy('d.academic_year', 'desc');
  await applyRoleScope(byYearQb, actor);
  if (filters.department_id) byYearQb.where('d.department_id', parseInt(filters.department_id, 10));

  // Monthly submission trend (last 12 months)
  const trendQb = db('documents as d')
    .whereNull('d.deleted_at')
    .where('d.created_at', '>=', db.raw("NOW() - INTERVAL '12 months'"))
    .select(db.raw("TO_CHAR(d.created_at, 'YYYY-MM') as month"))
    .count('d.id as count')
    .groupByRaw("TO_CHAR(d.created_at, 'YYYY-MM')")
    .orderByRaw("TO_CHAR(d.created_at, 'YYYY-MM') ASC");
  await applyRoleScope(trendQb, actor);
  if (filters.department_id) trendQb.where('d.department_id', parseInt(filters.department_id, 10));

  const [byStatus, byType, byDepartment, byYear, trend] = await Promise.all([
    byStatusQb, byTypeQb, byDeptQb, byYearQb, trendQb,
  ]);

  const total = byStatus.reduce((sum, r) => sum + parseInt(r.count, 10), 0);

  return {
    total,
    by_status:     byStatus.map((r) => ({ status: r.status, count: parseInt(r.count, 10) })),
    by_type:       byType.map((r)   => ({ document_type: r.document_type, count: parseInt(r.count, 10) })),
    by_department: byDepartment.map((r) => ({ department: r.department, count: parseInt(r.count, 10) })),
    by_year:       byYear.map((r)   => ({ academic_year: r.academic_year, count: parseInt(r.count, 10) })),
    trend:         trend.map((r)    => ({ month: r.month, count: parseInt(r.count, 10) })),
  };
}

// ─── Overdue report ──────────────────────────────────────────────────────────

async function getOverdueReport(filters, actor) {
  // Read threshold from system_settings; fall back to default
  let overdueDays = DEFAULT_OVERDUE_DAYS;
  try {
    const setting = await db('system_settings').where({ key: 'overdue_threshold_days' }).first();
    if (setting && setting.value) overdueDays = parseInt(setting.value, 10) || DEFAULT_OVERDUE_DAYS;
  } catch {
    // table may not exist in test env — use default
  }

  const qb = db('documents as d')
    .join('document_types as dt', 'dt.id', 'd.document_type_id')
    .join('departments as dep', 'dep.id', 'd.department_id')
    .join('users as u', 'u.id', 'd.student_id')
    .where('d.status', 'pending_approval')
    .whereNull('d.deleted_at')
    .whereRaw(`d.created_at <= NOW() - INTERVAL '${overdueDays} days'`)
    .select([
      'd.id',
      'd.reference_number',
      'd.title',
      'dt.name as document_type',
      'dep.name as department',
      'u.email as student_email',
      'd.status',
      'd.created_at as submitted_at',
      db.raw(`EXTRACT(EPOCH FROM (NOW() - d.created_at)) / 86400 AS days_pending`),
    ])
    .orderBy('d.created_at', 'asc');

  await applyRoleScope(qb, actor);
  if (filters.department_id) qb.where('d.department_id', parseInt(filters.department_id, 10));

  const rows = await qb;
  return rows.map((r) => ({
    ...r,
    days_pending: Math.floor(parseFloat(r.days_pending ?? 0)),
    overdue_threshold_days: overdueDays,
  }));
}

module.exports = { getPendingReport, getHistoryReport, getStatisticsReport, getOverdueReport };

'use strict';

const db = require('../config/db');

const TABLE = 'documents';

// Columns returned on every document query (file_path is intentionally excluded)
const COLUMNS = [
  'documents.id',
  'documents.reference_number',
  'documents.title',
  'documents.document_type_id',
  'documents.department_id',
  'documents.student_id',
  'documents.assigned_to_id',
  'documents.status',
  'documents.file_size',
  'documents.mime_type',
  'documents.academic_year',
  'documents.semester',
  'documents.financial_amount',
  'documents.barcode_number',
  'documents.version',
  'documents.created_at',
  'documents.updated_at',
];

function baseQuery() {
  return db(TABLE).select(COLUMNS).whereNull('documents.deleted_at');
}

function applyFilters(qb, filters) {
  if (filters.status) qb.where('documents.status', filters.status);
  if (filters.student_id) qb.where('documents.student_id', filters.student_id);
  if (filters.department_id) qb.where('documents.department_id', filters.department_id);
  if (filters.document_type_id) qb.where('documents.document_type_id', filters.document_type_id);
  if (filters.academic_year) qb.where('documents.academic_year', filters.academic_year);
  if (filters.reference_number) qb.where('documents.reference_number', filters.reference_number);
}

function findById(id) {
  return db(TABLE)
    .select([...COLUMNS, 'documents.file_path'])
    .where('documents.id', id)
    .whereNull('documents.deleted_at')
    .first();
}

function findAll({ filters = {}, limit, offset }) {
  const qb = baseQuery();
  applyFilters(qb, filters);
  return qb.orderBy('documents.created_at', 'desc').limit(limit).offset(offset);
}

function countAll({ filters = {} }) {
  const qb = db(TABLE).whereNull('deleted_at').count('id as count').first();
  // count uses unqualified names since there's no join
  if (filters.status) qb.where('status', filters.status);
  if (filters.student_id) qb.where('student_id', filters.student_id);
  if (filters.department_id) qb.where('department_id', filters.department_id);
  if (filters.document_type_id) qb.where('document_type_id', filters.document_type_id);
  if (filters.academic_year) qb.where('academic_year', filters.academic_year);
  if (filters.reference_number) qb.where('reference_number', filters.reference_number);
  return qb;
}

function insert(data, trx) {
  return (trx || db)(TABLE).insert(data).returning(COLUMNS);
}

module.exports = { findById, findAll, countAll, insert };

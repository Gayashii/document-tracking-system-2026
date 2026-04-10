'use strict';

const Joi = require('joi');

const STATUSES = ['submitted', 'pending_approval', 'approved', 'rejected', 'processed'];

const uploadBodySchema = Joi.object({
  title: Joi.string().min(1).max(255).required(),
  document_type_id: Joi.number().integer().positive().required(),
  department_id: Joi.number().integer().positive().required(),
  academic_year: Joi.string().max(20).optional(),
  semester: Joi.string().max(20).optional(),
  financial_amount: Joi.number().precision(2).min(0).optional(),
});

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  status: Joi.string().valid(...STATUSES),
  student_id: Joi.number().integer().positive(),
  department_id: Joi.number().integer().positive(),
  document_type_id: Joi.number().integer().positive(),
  academic_year: Joi.string().max(20),
  reference_number: Joi.string().max(20),
});

const idParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

const barcodeSchema = Joi.object({
  barcode_number: Joi.string().pattern(/^\d+$/).min(1).max(20).required()
    .messages({ 'string.pattern.base': 'barcode_number must contain digits only' }),
});

const statusUpdateSchema = Joi.object({
  status: Joi.string().valid(...STATUSES).required(),
  note: Joi.string().max(1000).optional().allow(''),
});

const historyQuerySchema = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
});

const versionBodySchema = Joi.object({
  change_note: Joi.string().max(1000).optional().allow(''),
});

const versionParamSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  versionId: Joi.number().integer().positive().required(),
});

const searchQuerySchema = Joi.object({
  q: Joi.string().max(500).optional(),
  type: Joi.number().integer().positive().optional(),
  status: Joi.string().custom((value, helpers) => {
    const parts = value.split(',').map((s) => s.trim());
    for (const part of parts) {
      if (!STATUSES.includes(part)) return helpers.error('any.invalid');
    }
    return value;
  }).optional(),
  from: Joi.string().isoDate().optional(),
  to: Joi.string().isoDate().optional(),
  student_id: Joi.number().integer().positive().optional(),
  amount_min: Joi.number().min(0).optional(),
  amount_max: Joi.number().min(0).optional(),
  department_id: Joi.number().integer().positive().optional(),
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
});

module.exports = {
  uploadBodySchema,
  listQuerySchema,
  idParamSchema,
  barcodeSchema,
  statusUpdateSchema,
  historyQuerySchema,
  versionBodySchema,
  versionParamSchema,
  searchQuerySchema,
};

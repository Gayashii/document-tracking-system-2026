'use strict';

const auditService  = require('../services/auditService');
const exportService = require('../services/exportService');
const asyncWrapper  = require('../utils/asyncWrapper');

const EXPORT_COLUMNS = [
  { key: 'created_at',   header: 'Timestamp',   width: 100 },
  { key: 'actor_email',  header: 'Actor',        width: 120 },
  { key: 'actor_role',   header: 'Role',         width: 70  },
  { key: 'action',       header: 'Action',       width: 110 },
  { key: 'entity_type',  header: 'Entity Type',  width: 80  },
  { key: 'entity_id',    header: 'Entity ID',    width: 60  },
  { key: 'ip_address',   header: 'IP Address',   width: 90  },
];

const list = asyncWrapper(async (req, res) => {
  const result = await auditService.query(req.query);
  res.json({ success: true, ...result });
});

const entityHistory = asyncWrapper(async (req, res) => {
  const { type, id } = req.params;
  const rows = await auditService.getEntityHistory(type, id);
  res.json({ success: true, data: rows, total: rows.length });
});

const exportCsv = asyncWrapper(async (req, res) => {
  const result = await auditService.query({ ...req.query, limit: 10000, page: 1 });
  const ts = new Date().toISOString().slice(0, 10);
  exportService.toCSV(
    result.data,
    EXPORT_COLUMNS.map((c) => c.key),
    res,
    `audit-log-${ts}.csv`,
  );
});

module.exports = { list, entityHistory, exportCsv };

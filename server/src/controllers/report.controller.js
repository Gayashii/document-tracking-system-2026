'use strict';

const reportService = require('../services/reportService');
const exportService = require('../services/exportService');
const asyncWrapper  = require('../utils/asyncWrapper');
const { ValidationError } = require('../utils/errors');

// ── Column definitions per report (shared between JSON and export) ────────────

const PENDING_COLS = [
  { key: 'reference_number', header: 'Reference No.',  width: 90 },
  { key: 'title',            header: 'Title',          width: 140 },
  { key: 'document_type',    header: 'Document Type',  width: 100 },
  { key: 'department',       header: 'Department',     width: 80  },
  { key: 'student_email',    header: 'Student',        width: 120 },
  { key: 'status',           header: 'Status',         width: 70  },
  { key: 'submitted_at',     header: 'Submitted At',   width: 90  },
  { key: 'days_pending',     header: 'Days Pending',   width: 60  },
];

const HISTORY_COLS = [
  { key: 'reference_number',  header: 'Reference No.',   width: 90  },
  { key: 'title',             header: 'Title',            width: 120 },
  { key: 'document_type',     header: 'Document Type',    width: 100 },
  { key: 'department',        header: 'Department',       width: 80  },
  { key: 'student_email',     header: 'Student',          width: 120 },
  { key: 'from_status',       header: 'From Status',      width: 70  },
  { key: 'to_status',         header: 'To Status',        width: 70  },
  { key: 'changed_at',        header: 'Changed At',       width: 90  },
  { key: 'changed_by_email',  header: 'Changed By',       width: 120 },
  { key: 'changed_by_role',   header: 'Role',             width: 70  },
  { key: 'note',              header: 'Note',             width: 130 },
];

const OVERDUE_COLS = [
  { key: 'reference_number', header: 'Reference No.',  width: 90  },
  { key: 'title',            header: 'Title',          width: 140 },
  { key: 'document_type',    header: 'Document Type',  width: 100 },
  { key: 'department',       header: 'Department',     width: 80  },
  { key: 'student_email',    header: 'Student',        width: 120 },
  { key: 'submitted_at',     header: 'Submitted At',   width: 90  },
  { key: 'days_pending',     header: 'Days Pending',   width: 60  },
];

// ── Report handlers ───────────────────────────────────────────────────────────

const pending = asyncWrapper(async (req, res) => {
  const rows = await reportService.getPendingReport(req.query, req.user);
  res.json({ success: true, data: rows, total: rows.length });
});

const history = asyncWrapper(async (req, res) => {
  const rows = await reportService.getHistoryReport(req.query, req.user);
  res.json({ success: true, data: rows, total: rows.length });
});

const statistics = asyncWrapper(async (req, res) => {
  const data = await reportService.getStatisticsReport(req.query, req.user);
  res.json({ success: true, data });
});

const overdue = asyncWrapper(async (req, res) => {
  const rows = await reportService.getOverdueReport(req.query, req.user);
  res.json({ success: true, data: rows, total: rows.length });
});

// ── Export handler ────────────────────────────────────────────────────────────

const exportReport = asyncWrapper(async (req, res) => {
  const { report, format } = req.query;

  const validReports = ['pending', 'history', 'overdue'];
  const validFormats = ['csv', 'xlsx', 'pdf'];

  if (!validReports.includes(report)) {
    throw new ValidationError(`report must be one of: ${validReports.join(', ')}`);
  }
  if (!validFormats.includes(format)) {
    throw new ValidationError(`format must be one of: ${validFormats.join(', ')}`);
  }

  let rows;
  let columns;
  let reportTitle;

  if (report === 'pending') {
    rows = await reportService.getPendingReport(req.query, req.user);
    columns = PENDING_COLS;
    reportTitle = 'Pending Documents Report';
  } else if (report === 'history') {
    rows = await reportService.getHistoryReport(req.query, req.user);
    columns = HISTORY_COLS;
    reportTitle = 'Document History Report';
  } else {
    rows = await reportService.getOverdueReport(req.query, req.user);
    columns = OVERDUE_COLS;
    reportTitle = 'Overdue Documents Report';
  }

  const ts = new Date().toISOString().slice(0, 10);
  const filename = `${report}-report-${ts}`;

  if (format === 'csv') {
    exportService.toCSV(rows, columns.map((c) => c.key), res, `${filename}.csv`);
  } else if (format === 'xlsx') {
    await exportService.toExcel(rows, columns, reportTitle, res, `${filename}.xlsx`);
  } else {
    exportService.toPDF(rows, columns, reportTitle, res, `${filename}.pdf`);
  }
});

module.exports = { pending, history, statistics, overdue, exportReport };

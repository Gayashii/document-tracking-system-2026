'use strict';

const { PassThrough } = require('stream');
const exportService = require('../../src/services/exportService');

const SAMPLE_ROWS = [
  { reference_number: 'PGI-2026-000001', title: 'Scholarship Form', status: 'submitted', days_pending: 3 },
  { reference_number: 'PGI-2026-000002', title: 'Lab Fee Receipt',   status: 'approved',  days_pending: 0 },
  { reference_number: 'PGI-2026-000003', title: 'Bursary Request',   status: 'rejected',  days_pending: 1 },
];

const COLUMNS = [
  { key: 'reference_number', header: 'Reference No.', width: 90 },
  { key: 'title',            header: 'Title',         width: 120 },
  { key: 'status',           header: 'Status',        width: 70 },
  { key: 'days_pending',     header: 'Days Pending',  width: 60 },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Create a mock response that IS a PassThrough (real Writable) so pipe() works.
 */
function mockRes() {
  const chunks = [];
  const pt = new PassThrough();
  pt.headers = {};
  pt.setHeader = (k, v) => { pt.headers[k] = v; };
  pt.on('data', (chunk) => chunks.push(chunk));
  pt.getBuffer = () => Buffer.concat(chunks);
  return pt;
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

describe('exportService.toCSV', () => {
  it('sets correct Content-Type and Content-Disposition headers', (done) => {
    const res = mockRes();
    exportService.toCSV(SAMPLE_ROWS, COLUMNS.map((c) => c.key), res, 'test.csv');

    res.on('finish', () => {
      expect(res.headers['Content-Type']).toMatch(/text\/csv/);
      expect(res.headers['Content-Disposition']).toContain('attachment');
      expect(res.headers['Content-Disposition']).toContain('test.csv');
      done();
    });
  });

  it('streams the correct number of data rows (excluding header)', (done) => {
    const res = mockRes();
    exportService.toCSV(SAMPLE_ROWS, COLUMNS.map((c) => c.key), res, 'test.csv');

    res.on('finish', () => {
      const text = res.getBuffer().toString('utf8').replace(/^\uFEFF/, ''); // strip BOM
      const lines = text.trim().split('\n').filter((l) => l.trim());
      // 1 header + 3 data rows
      expect(lines).toHaveLength(4);
      done();
    });
  });

  it('includes all column headers in the first row', (done) => {
    const res = mockRes();
    exportService.toCSV(SAMPLE_ROWS, COLUMNS.map((c) => c.key), res, 'test.csv');

    res.on('finish', () => {
      const text = res.getBuffer().toString('utf8').replace(/^\uFEFF/, '');
      const header = text.split('\n')[0];
      for (const col of COLUMNS) {
        expect(header).toContain(col.key);
      }
      done();
    });
  });

  it('handles empty rows array — does not throw', (done) => {
    const res = mockRes();
    expect(() => {
      exportService.toCSV([], COLUMNS.map((c) => c.key), res, 'empty.csv');
    }).not.toThrow();

    res.on('finish', () => done());
  });
});

// ─── PDF ─────────────────────────────────────────────────────────────────────

describe('exportService.toPDF', () => {
  it('sets correct Content-Type and Content-Disposition headers', (done) => {
    const res = mockRes();
    exportService.toPDF(SAMPLE_ROWS, COLUMNS, 'Test Report', res, 'test.pdf');

    res.on('finish', () => {
      expect(res.headers['Content-Type']).toBe('application/pdf');
      expect(res.headers['Content-Disposition']).toContain('attachment');
      expect(res.headers['Content-Disposition']).toContain('test.pdf');
      done();
    });
  });

  it('produces a valid PDF (starts with %PDF)', (done) => {
    const res = mockRes();
    exportService.toPDF(SAMPLE_ROWS, COLUMNS, 'Test Report', res, 'test.pdf');

    res.on('finish', () => {
      const buf = res.getBuffer();
      expect(buf.slice(0, 4).toString()).toBe('%PDF');
      done();
    });
  });

  it('handles empty rows array without throwing', (done) => {
    const res = mockRes();
    expect(() => {
      exportService.toPDF([], COLUMNS, 'Empty Report', res, 'empty.pdf');
    }).not.toThrow();

    res.on('finish', () => {
      const buf = res.getBuffer();
      expect(buf.slice(0, 4).toString()).toBe('%PDF');
      done();
    });
  });
});

// ─── Excel ───────────────────────────────────────────────────────────────────

describe('exportService.toExcel', () => {
  it('sets correct Content-Type and Content-Disposition headers', async () => {
    const chunks = [];
    const res = {
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      end() {},
      write(chunk) { chunks.push(chunk); },
    };

    await exportService.toExcel(SAMPLE_ROWS, COLUMNS, 'Sheet1', res, 'test.xlsx');

    expect(res.headers['Content-Type']).toContain('spreadsheetml');
    expect(res.headers['Content-Disposition']).toContain('attachment');
    expect(res.headers['Content-Disposition']).toContain('test.xlsx');
  });
});

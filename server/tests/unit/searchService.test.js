'use strict';

/**
 * Unit tests for documentService.search()
 *
 * Verifies:
 *  1. Correct SQL clauses are applied per filter combination
 *  2. Student role cannot bypass scoping (own documents only)
 */

const mockRows = [{ id: 1, reference_number: 'PGI-2026-000001', title: 'Test' }];
const mockCount = { count: '1' };

// ── DB mock ──────────────────────────────────────────────────────────────────
let capturedQuery = {};

function mockMakeQb() {
  const qb = {
    _wheres: [],
    _whereIns: [],
    _whereRaws: [],
    _whereNulls: [],
    _selects: [],
    _joins: [],
    _orders: [],
    _limit: null,
    _offset: null,

    leftJoin: jest.fn(function () { return this; }),
    whereNull: jest.fn(function (col) { this._whereNulls.push(col); return this; }),
    where: jest.fn(function (...args) { this._wheres.push(args); return this; }),
    whereIn: jest.fn(function (col, vals) { this._whereIns.push({ col, vals }); return this; }),
    whereRaw: jest.fn(function (sql, bindings) { this._whereRaws.push({ sql, bindings }); return this; }),
    select: jest.fn(function () { return this; }),
    orderBy: jest.fn(function () { return this; }),
    limit: jest.fn(function (n) { this._limit = n; return this; }),
    offset: jest.fn(function (n) { this._offset = n; return this; }),
    count: jest.fn(function () { return this; }),
    first: jest.fn(function () { return Promise.resolve(mockCount); }),
    clone: jest.fn(function () {
      const copy = mockMakeQb();
      copy._wheres    = [...this._wheres];
      copy._whereIns  = [...this._whereIns];
      copy._whereRaws = [...this._whereRaws];
      copy._whereNulls = [...this._whereNulls];
      return copy;
    }),
    then: undefined, // not a Promise itself
  };

  // Thenable-ish: make the qb resolve when awaited directly
  Object.defineProperty(qb, Symbol.toStringTag, { value: 'QueryBuilder' });
  // Override then to resolve with mockRows when limit is called (data query)
  qb.limit = jest.fn(function (n) {
    this._limit = n;
    const self = this;
    self[Symbol.iterator] = undefined;
    // Make it awaitable
    const p = Promise.resolve(mockRows);
    Object.assign(self, {
      then: p.then.bind(p),
      catch: p.catch.bind(p),
    });
    return self;
  });

  return qb;
}

jest.mock('../../src/config/db', () => {
  const db = jest.fn().mockImplementation(() => mockMakeQb());
  db.fn = { now: jest.fn(() => new Date()) };
  db.transaction = jest.fn();
  return db;
});

jest.mock('../../src/services/auditService', () => ({ log: jest.fn().mockResolvedValue() }));
jest.mock('../../src/services/storageService', () => ({
  saveFile: jest.fn(() => 'uploads/test.pdf'),
  resolvePath: jest.fn((p) => `/abs/${p}`),
}));
jest.mock('../../src/utils/referenceNumber', () => ({
  generateReferenceNumber: jest.fn().mockResolvedValue('PGI-2026-000001'),
}));
jest.mock('../../src/events/documentEvents', () => ({ emit: jest.fn() }));

const db = require('../../src/config/db');
const documentService = require('../../src/services/documentService');

const adminActor   = { id: 1, role: 'admin' };
const staffActor   = { id: 2, role: 'finance_staff' };
const studentActor = { id: 3, role: 'student' };

// Helper: capture which `.where` calls were made during a search
async function runSearch(filters, actor) {
  const qbInstance = mockMakeQb();
  const calls = { wheres: [], whereIns: [], whereRaws: [], whereNulls: [] };

  qbInstance.whereNull = jest.fn(function (col) {
    calls.whereNulls.push(col);
    return this;
  });
  qbInstance.where = jest.fn(function (...args) {
    calls.wheres.push(args);
    return this;
  });
  qbInstance.whereIn = jest.fn(function (col, vals) {
    calls.whereIns.push({ col, vals });
    return this;
  });
  qbInstance.whereRaw = jest.fn(function (sql, bindings) {
    calls.whereRaws.push({ sql, bindings });
    return this;
  });
  qbInstance.clone = jest.fn(() => {
    const c = mockMakeQb();
    c._wheres    = calls.wheres.map((w) => w);
    c.where     = qbInstance.where;
    c.whereIn   = qbInstance.whereIn;
    c.whereRaw  = qbInstance.whereRaw;
    c.whereNull = qbInstance.whereNull;
    return c;
  });

  db.mockImplementationOnce(() => qbInstance);

  try {
    await documentService.search(filters, actor);
  } catch {
    // ignore — we only care about captured calls
  }

  return calls;
}

describe('documentService.search', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── Role scoping ─────────────────────────────────────────────────────────

  it('student: forces where student_id = actor.id regardless of params', async () => {
    const calls = await runSearch({}, studentActor);
    const scopeCall = calls.wheres.find(
      ([col, val]) => col === 'd.student_id' && val === studentActor.id,
    );
    expect(scopeCall).toBeDefined();
  });

  it('student: explicit student_id param for another student is ignored', async () => {
    const calls = await runSearch({ student_id: 999 }, studentActor);
    const scopeCall = calls.wheres.find(
      ([col, val]) => col === 'd.student_id' && val === studentActor.id,
    );
    expect(scopeCall).toBeDefined();
    // Must NOT also apply the param student_id=999
    const foreignCall = calls.wheres.find(
      ([col, val]) => col === 'd.student_id' && val === 999,
    );
    expect(foreignCall).toBeUndefined();
  });

  it('admin: applies explicit student_id filter when provided', async () => {
    const calls = await runSearch({ student_id: '42' }, adminActor);
    const scopeCall = calls.wheres.find(
      ([col, val]) => col === 'd.student_id' && val === 42,
    );
    expect(scopeCall).toBeDefined();
  });

  it('admin: no student_id scoping when param is absent', async () => {
    const calls = await runSearch({}, adminActor);
    const anyStudentScope = calls.wheres.some(([col]) => col === 'd.student_id');
    expect(anyStudentScope).toBe(false);
  });

  // ── Full-text search ─────────────────────────────────────────────────────

  it('applies FTS whereRaw when q param is present', async () => {
    const calls = await runSearch({ q: 'scholarship' }, staffActor);
    const ftsCall = calls.whereRaws.find(({ sql }) =>
      sql.includes('search_vector') && sql.includes('plainto_tsquery'),
    );
    expect(ftsCall).toBeDefined();
    expect(ftsCall.bindings).toEqual(['scholarship']);
  });

  it('does NOT add FTS clause when q is absent', async () => {
    const calls = await runSearch({}, staffActor);
    const ftsCall = calls.whereRaws.find(({ sql }) => sql.includes('search_vector'));
    expect(ftsCall).toBeUndefined();
  });

  // ── Single status ────────────────────────────────────────────────────────

  it('applies single status as where clause', async () => {
    const calls = await runSearch({ status: 'submitted' }, adminActor);
    const statusCall = calls.wheres.find(([col, val]) => col === 'd.status' && val === 'submitted');
    expect(statusCall).toBeDefined();
  });

  // ── Comma-separated status list ──────────────────────────────────────────

  it('applies comma-separated status list as whereIn', async () => {
    const calls = await runSearch({ status: 'submitted,approved' }, adminActor);
    const statusIn = calls.whereIns.find(({ col }) => col === 'd.status');
    expect(statusIn).toBeDefined();
    expect(statusIn.vals).toEqual(['submitted', 'approved']);
  });

  // ── Date range ───────────────────────────────────────────────────────────

  it('applies from/to date range filters', async () => {
    const calls = await runSearch({ from: '2026-01-01', to: '2026-12-31' }, adminActor);
    const fromCall = calls.wheres.find(([col, op]) => col === 'd.created_at' && op === '>=');
    const toCall   = calls.wheres.find(([col, op]) => col === 'd.created_at' && op === '<=');
    expect(fromCall).toBeDefined();
    expect(toCall).toBeDefined();
  });

  // ── Financial amount range ───────────────────────────────────────────────

  it('applies amount_min and amount_max filters', async () => {
    const calls = await runSearch({ amount_min: '100', amount_max: '500' }, adminActor);
    const minCall = calls.wheres.find(([col, op]) => col === 'd.financial_amount' && op === '>=');
    const maxCall = calls.wheres.find(([col, op]) => col === 'd.financial_amount' && op === '<=');
    expect(minCall).toBeDefined();
    expect(maxCall).toBeDefined();
  });

  // ── Department ───────────────────────────────────────────────────────────

  it('applies department_id filter', async () => {
    const calls = await runSearch({ department_id: '2' }, adminActor);
    const deptCall = calls.wheres.find(([col, val]) => col === 'd.department_id' && val === 2);
    expect(deptCall).toBeDefined();
  });

  // ── Type ─────────────────────────────────────────────────────────────────

  it('applies document type filter', async () => {
    const calls = await runSearch({ type: '3' }, adminActor);
    const typeCall = calls.wheres.find(([col, val]) => col === 'd.document_type_id' && val === 3);
    expect(typeCall).toBeDefined();
  });
});

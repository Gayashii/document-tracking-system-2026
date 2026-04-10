'use strict';

/**
 * Unit tests for auditService.query()
 * Verifies that each filter param produces the correct WHERE clause.
 */

// ── DB mock ──────────────────────────────────────────────────────────────────

function mockMakeQb() {
  const calls = { wheres: [], whereLikes: [], orders: [], limits: [], offsets: [] };

  const qb = {
    _calls: calls,
    leftJoin:    jest.fn().mockReturnThis(),
    select:      jest.fn().mockReturnThis(),
    orderBy:     jest.fn(function (...a) { calls.orders.push(a); return this; }),
    where:       jest.fn(function (...a) { calls.wheres.push(a); return this; }),
    limit:       jest.fn(function (n) { calls.limits.push(n); return this; }),
    offset:      jest.fn(function (n) { calls.offsets.push(n); return this; }),
    clearSelect: jest.fn().mockReturnThis(),
    clearOrder:  jest.fn().mockReturnThis(),
    count:       jest.fn().mockReturnThis(),
    first:       jest.fn().mockResolvedValue({ count: '0' }),
    clone:       jest.fn(function () {
      const c = mockMakeQb();
      // share the calls reference so assertions work on the same object
      c._calls = calls;
      c.where     = qb.where;
      c.orderBy   = qb.orderBy;
      c.limit     = qb.limit;
      c.offset    = qb.offset;
      return c;
    }),
    // Make it awaitable (data query returns empty array)
    then: undefined,
  };

  // Resolve with [] when limit() is the final call
  qb.limit = jest.fn(function (n) {
    calls.limits.push(n);
    const p = Promise.resolve([]);
    Object.assign(qb, { then: p.then.bind(p), catch: p.catch.bind(p) });
    return qb;
  });

  return qb;
}

let mockCurrentQb;

jest.mock('../../src/config/db', () => {
  const db = jest.fn().mockImplementation(() => {
    mockCurrentQb = mockMakeQb();
    return mockCurrentQb;
  });
  db.fn = { now: jest.fn(() => new Date()) };
  db.transaction = jest.fn();
  return db;
});

jest.mock('../../src/utils/paginate', () => ({
  parsePagination: jest.fn().mockReturnValue({ page: 1, limit: 25, offset: 0 }),
  paginate: jest.fn().mockReturnValue({ data: [], pagination: {} }),
}));

const auditService = require('../../src/services/auditService');

describe('auditService.query', () => {
  beforeEach(() => jest.clearAllMocks());

  it('no filters: no extra where clauses added', async () => {
    await auditService.query({});
    const wheres = mockCurrentQb._calls.wheres;
    expect(wheres).toHaveLength(0);
  });

  it('actor_id filter adds where clause', async () => {
    await auditService.query({ actor_id: '5' });
    const match = mockCurrentQb._calls.wheres.find(([col, val]) => col === 'al.actor_id' && val === 5);
    expect(match).toBeDefined();
  });

  it('entity_type filter adds where clause', async () => {
    await auditService.query({ entity_type: 'document' });
    const match = mockCurrentQb._calls.wheres.find(([col, val]) => col === 'al.entity_type' && val === 'document');
    expect(match).toBeDefined();
  });

  it('entity_id filter adds where clause', async () => {
    await auditService.query({ entity_id: '42' });
    const match = mockCurrentQb._calls.wheres.find(([col, val]) => col === 'al.entity_id' && val === 42);
    expect(match).toBeDefined();
  });

  it('action filter adds where clause', async () => {
    await auditService.query({ action: 'DOCUMENT_UPLOADED' });
    const match = mockCurrentQb._calls.wheres.find(([col, val]) => col === 'al.action' && val === 'DOCUMENT_UPLOADED');
    expect(match).toBeDefined();
  });

  it('from filter adds a >= where clause', async () => {
    await auditService.query({ from: '2026-01-01' });
    const match = mockCurrentQb._calls.wheres.find(([col, op]) => col === 'al.created_at' && op === '>=');
    expect(match).toBeDefined();
  });

  it('to filter adds a <= where clause', async () => {
    await auditService.query({ to: '2026-12-31' });
    const match = mockCurrentQb._calls.wheres.find(([col, op]) => col === 'al.created_at' && op === '<=');
    expect(match).toBeDefined();
  });

  it('actor_email filter adds ilike where clause', async () => {
    await auditService.query({ actor_email: 'staff@' });
    const match = mockCurrentQb._calls.wheres.find(
      ([col, op, val]) => col === 'u.email' && op === 'ilike' && val === '%staff@%',
    );
    expect(match).toBeDefined();
  });

  it('combined filters apply all clauses', async () => {
    await auditService.query({
      actor_id: '3',
      entity_type: 'document',
      action: 'DOCUMENT_DELETED',
      from: '2026-01-01',
      to: '2026-06-30',
    });
    const wheres = mockCurrentQb._calls.wheres;
    expect(wheres.some(([col]) => col === 'al.actor_id')).toBe(true);
    expect(wheres.some(([col]) => col === 'al.entity_type')).toBe(true);
    expect(wheres.some(([col]) => col === 'al.action')).toBe(true);
    expect(wheres.some(([col, op]) => col === 'al.created_at' && op === '>=')).toBe(true);
    expect(wheres.some(([col, op]) => col === 'al.created_at' && op === '<=')).toBe(true);
  });

  it('results are always sorted by created_at DESC', async () => {
    await auditService.query({});
    const order = mockCurrentQb._calls.orders[0];
    expect(order).toEqual(['al.created_at', 'desc']);
  });
});

'use strict';

jest.mock('../../src/config/db', () => {
  const trxMock = {
    fn: { now: jest.fn(() => new Date()) },
    commit: jest.fn(),
    rollback: jest.fn(),
  };
  // Chainable query builder stub
  const qb = () => ({
    where: jest.fn().mockReturnThis(),
    whereNull: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([{ id: 1, status: 'pending_approval' }]),
    insert: jest.fn().mockResolvedValue([1]),
    first: jest.fn().mockResolvedValue(null), // overridden per test
  });

  const db = jest.fn().mockImplementation(qb);
  db.transaction = jest.fn(async (cb) => cb({ ...qb(), fn: { now: jest.fn(() => new Date()) } }));
  return db;
});

jest.mock('../../src/services/auditService', () => ({ log: jest.fn().mockResolvedValue() }));
jest.mock('../../src/events/documentEvents', () => ({ emit: jest.fn() }));

const db = require('../../src/config/db');
const documentEvents = require('../../src/events/documentEvents');
const workflowService = require('../../src/services/workflowService');
const { WorkflowError, ForbiddenError, NotFoundError } = require('../../src/utils/errors');

function makeDoc(status) {
  return { id: 1, status, deleted_at: null };
}

function mockDocFetch(doc) {
  db.mockImplementationOnce(() => ({
    where: jest.fn().mockReturnThis(),
    whereNull: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(doc),
  }));
}

const adminActor    = { id: 10, role: 'admin' };
const staffActor    = { id: 11, role: 'finance_staff' };
const studentActor  = { id: 12, role: 'student' };
const auditorActor  = { id: 13, role: 'auditor' };

describe('workflowService.transition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default transaction stub that resolves with the updated doc
    db.transaction = jest.fn(async (cb) => {
      const trx = jest.fn().mockImplementation(() => ({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 1, status: 'pending_approval' }]),
        insert: jest.fn().mockResolvedValue([1]),
      }));
      trx.fn = { now: jest.fn(() => new Date()) };
      return cb(trx);
    });
  });

  // ── Valid transitions ────────────────────────────────────────────────────────
  it('allows finance_staff to move submitted → pending_approval', async () => {
    mockDocFetch(makeDoc('submitted'));
    await expect(
      workflowService.transition({ documentId: 1, toStatus: 'pending_approval', actor: staffActor }),
    ).resolves.toBeDefined();
  });

  it('allows admin to move submitted → pending_approval', async () => {
    mockDocFetch(makeDoc('submitted'));
    await expect(
      workflowService.transition({ documentId: 1, toStatus: 'pending_approval', actor: adminActor }),
    ).resolves.toBeDefined();
  });

  it('allows finance_staff to move pending_approval → approved', async () => {
    mockDocFetch(makeDoc('pending_approval'));
    db.transaction = jest.fn(async (cb) => {
      const trx = jest.fn().mockImplementation(() => ({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 1, status: 'approved' }]),
        insert: jest.fn().mockResolvedValue([1]),
      }));
      trx.fn = { now: jest.fn(() => new Date()) };
      return cb(trx);
    });
    await expect(
      workflowService.transition({ documentId: 1, toStatus: 'approved', actor: staffActor }),
    ).resolves.toBeDefined();
  });

  it('allows finance_staff to move pending_approval → rejected', async () => {
    mockDocFetch(makeDoc('pending_approval'));
    db.transaction = jest.fn(async (cb) => {
      const trx = jest.fn().mockImplementation(() => ({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 1, status: 'rejected' }]),
        insert: jest.fn().mockResolvedValue([1]),
      }));
      trx.fn = { now: jest.fn(() => new Date()) };
      return cb(trx);
    });
    await expect(
      workflowService.transition({ documentId: 1, toStatus: 'rejected', actor: staffActor }),
    ).resolves.toBeDefined();
  });

  it('allows finance_staff to move approved → processed', async () => {
    mockDocFetch(makeDoc('approved'));
    db.transaction = jest.fn(async (cb) => {
      const trx = jest.fn().mockImplementation(() => ({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 1, status: 'processed' }]),
        insert: jest.fn().mockResolvedValue([1]),
      }));
      trx.fn = { now: jest.fn(() => new Date()) };
      return cb(trx);
    });
    await expect(
      workflowService.transition({ documentId: 1, toStatus: 'processed', actor: staffActor }),
    ).resolves.toBeDefined();
  });

  it('allows student to re-submit a rejected document', async () => {
    mockDocFetch(makeDoc('rejected'));
    db.transaction = jest.fn(async (cb) => {
      const trx = jest.fn().mockImplementation(() => ({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 1, status: 'submitted' }]),
        insert: jest.fn().mockResolvedValue([1]),
      }));
      trx.fn = { now: jest.fn(() => new Date()) };
      return cb(trx);
    });
    await expect(
      workflowService.transition({ documentId: 1, toStatus: 'submitted', actor: studentActor }),
    ).resolves.toBeDefined();
  });

  // ── Event emission ───────────────────────────────────────────────────────────
  it('emits document.status_changed after a successful transition', async () => {
    mockDocFetch(makeDoc('submitted'));
    await workflowService.transition({
      documentId: 1,
      toStatus: 'pending_approval',
      actor: staffActor,
      note: 'looks good',
    });
    expect(documentEvents.emit).toHaveBeenCalledWith('document.status_changed', {
      documentId: 1,
      fromStatus: 'submitted',
      toStatus: 'pending_approval',
      actorId: staffActor.id,
      note: 'looks good',
    });
  });

  // ── Invalid transitions ──────────────────────────────────────────────────────
  it('throws WorkflowError for a non-existent transition (submitted → processed)', async () => {
    mockDocFetch(makeDoc('submitted'));
    await expect(
      workflowService.transition({ documentId: 1, toStatus: 'processed', actor: staffActor }),
    ).rejects.toThrow(WorkflowError);
  });

  it('throws WorkflowError when trying to advance from a terminal status (processed → approved)', async () => {
    mockDocFetch(makeDoc('processed'));
    await expect(
      workflowService.transition({ documentId: 1, toStatus: 'approved', actor: adminActor }),
    ).rejects.toThrow(WorkflowError);
  });

  it('throws WorkflowError for a backwards transition (approved → submitted)', async () => {
    mockDocFetch(makeDoc('approved'));
    await expect(
      workflowService.transition({ documentId: 1, toStatus: 'submitted', actor: adminActor }),
    ).rejects.toThrow(WorkflowError);
  });

  // ── Role violations ──────────────────────────────────────────────────────────
  it('throws ForbiddenError when student tries to advance submitted → pending_approval', async () => {
    mockDocFetch(makeDoc('submitted'));
    await expect(
      workflowService.transition({ documentId: 1, toStatus: 'pending_approval', actor: studentActor }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws ForbiddenError when auditor tries to advance any status', async () => {
    mockDocFetch(makeDoc('submitted'));
    await expect(
      workflowService.transition({ documentId: 1, toStatus: 'pending_approval', actor: auditorActor }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws ForbiddenError when finance_staff tries to re-submit on behalf of student', async () => {
    mockDocFetch(makeDoc('rejected'));
    await expect(
      workflowService.transition({ documentId: 1, toStatus: 'submitted', actor: staffActor }),
    ).rejects.toThrow(ForbiddenError);
  });

  // ── Not found ────────────────────────────────────────────────────────────────
  it('throws NotFoundError when document does not exist', async () => {
    mockDocFetch(null);
    await expect(
      workflowService.transition({ documentId: 999, toStatus: 'pending_approval', actor: staffActor }),
    ).rejects.toThrow(NotFoundError);
  });
});

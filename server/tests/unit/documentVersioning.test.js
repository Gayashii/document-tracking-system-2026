'use strict';

jest.mock('../../src/config/db', () => {
  const qb = () => ({
    where: jest.fn().mockReturnThis(),
    whereNull: jest.fn().mockReturnThis(),
    whereNot: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([{ id: 1, status: 'submitted', version: 2 }]),
    insert: jest.fn().mockResolvedValue([1]),
    first: jest.fn().mockResolvedValue(null),
    select: jest.fn().mockReturnThis(),
    join: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
  });
  const db = jest.fn().mockImplementation(qb);
  db.transaction = jest.fn(async (cb) =>
    cb({ ...qb(), fn: { now: jest.fn(() => new Date()) } }),
  );
  db.fn = { now: jest.fn(() => new Date()) };
  return db;
});

jest.mock('../../src/services/auditService', () => ({ log: jest.fn().mockResolvedValue() }));
jest.mock('../../src/services/storageService', () => ({
  saveFile: jest.fn(() => 'uploads/documents/PGI-2026-000001/v2/file.pdf'),
  resolvePath: jest.fn((p) => `/server/${p}`),
}));
jest.mock('../../src/events/documentEvents', () => ({ emit: jest.fn() }));
jest.mock('../../src/models/document.model', () => ({
  findById: jest.fn(),
  findAll: jest.fn(),
  countAll: jest.fn(),
  insert: jest.fn(),
}));

const db = require('../../src/config/db');
const documentModel = require('../../src/models/document.model');
const { createVersion } = require('../../src/services/documentService');
const { WorkflowError, ForbiddenError, NotFoundError } = require('../../src/utils/errors');

const fakeFile = {
  buffer: Buffer.from('pdf-content'),
  originalname: 'revised.pdf',
  size: 1024,
  mimetype: 'application/pdf',
};

const owner = { id: 5, role: 'student' };
const other = { id: 6, role: 'student' };

function mockDoc(overrides = {}) {
  return {
    id: 1,
    reference_number: 'PGI-2026-000001',
    title: 'Test Doc',
    student_id: owner.id,
    status: 'rejected',
    file_path: 'uploads/documents/PGI-2026-000001/v1/file.pdf',
    version: 1,
    deleted_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default transaction stub that returns updated doc
  db.transaction.mockImplementation(async (cb) => {
    const trx = {
      fn: { now: jest.fn(() => new Date()) },
      documents: jest.fn().mockReturnThis(),
      document_versions: jest.fn().mockReturnThis(),
      document_status_history: jest.fn().mockReturnThis(),
    };
    // make trx('table') chainable
    const trxFn = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ id: 1, status: 'submitted', version: 2 }]),
      insert: jest.fn().mockResolvedValue([1]),
    }));
    trxFn.fn = { now: jest.fn(() => new Date()) };
    return cb(trxFn);
  });
});

describe('documentService.createVersion', () => {
  it('throws NotFoundError when document does not exist', async () => {
    documentModel.findById.mockResolvedValue(null);
    await expect(
      createVersion({ id: 99, file: fakeFile, actor: owner }),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws WorkflowError when document status is not rejected', async () => {
    documentModel.findById.mockResolvedValue(mockDoc({ status: 'submitted' }));
    await expect(
      createVersion({ id: 1, file: fakeFile, actor: owner }),
    ).rejects.toThrow(WorkflowError);
  });

  it('throws WorkflowError for pending_approval status', async () => {
    documentModel.findById.mockResolvedValue(mockDoc({ status: 'pending_approval' }));
    await expect(
      createVersion({ id: 1, file: fakeFile, actor: owner }),
    ).rejects.toThrow(WorkflowError);
  });

  it('throws ForbiddenError when actor is not the document owner', async () => {
    documentModel.findById.mockResolvedValue(mockDoc());
    await expect(
      createVersion({ id: 1, file: fakeFile, actor: other }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('resolves successfully for the document owner on a rejected doc', async () => {
    documentModel.findById.mockResolvedValue(mockDoc());
    const result = await createVersion({ id: 1, file: fakeFile, actor: owner });
    expect(result).toMatchObject({ status: 'submitted', version: 2 });
  });
});

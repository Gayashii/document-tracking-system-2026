'use strict';

jest.mock('../../src/config/db', () => {
  const qb = () => ({
    where: jest.fn().mockReturnThis(),
    whereNot: jest.fn().mockReturnThis(),
    whereNull: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([{ id: 1, reference_number: 'PGI-2026-000001', title: 'Test', status: 'submitted', barcode_number: 'BC001', updated_at: new Date() }]),
    first: jest.fn().mockResolvedValue(null),
    insert: jest.fn().mockResolvedValue([1]),
    select: jest.fn().mockReturnThis(),
  });
  const db = jest.fn().mockImplementation(qb);
  db.fn = { now: jest.fn(() => new Date()) };
  return db;
});

jest.mock('../../src/services/auditService', () => ({ log: jest.fn().mockResolvedValue() }));

const db = require('../../src/config/db');
const documentService = require('../../src/services/documentService');
const { ConflictError, NotFoundError } = require('../../src/utils/errors');

const actor = { id: 5, role: 'finance_staff' };

describe('documentService.setBarcode', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns updated document on successful barcode assignment', async () => {
    // findById returns a document
    db.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ id: 1, status: 'submitted', file_path: 'uploads/x' }),
    }));
    // duplicate check returns null (no conflict)
    db.mockImplementationOnce(() => ({
      where: jest.fn().mockReturnThis(),
      whereNot: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null),
    }));
    // update returning
    db.mockImplementationOnce(() => ({
      where: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ id: 1, barcode_number: 'BC001' }]),
    }));

    const result = await documentService.setBarcode({ id: 1, barcodeNumber: 'BC001', user: actor });
    expect(result.barcode_number).toBe('BC001');
  });

  it('throws ConflictError when barcode is already assigned to another document', async () => {
    // findById returns a document
    db.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ id: 1, status: 'submitted', file_path: 'uploads/x' }),
    }));
    // duplicate check finds an existing doc with this barcode
    db.mockImplementationOnce(() => ({
      where: jest.fn().mockReturnThis(),
      whereNot: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ id: 2, barcode_number: 'BC001' }),
    }));

    await expect(
      documentService.setBarcode({ id: 1, barcodeNumber: 'BC001', user: actor }),
    ).rejects.toThrow(ConflictError);
  });

  it('throws NotFoundError when document does not exist', async () => {
    db.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null),
    }));

    await expect(
      documentService.setBarcode({ id: 999, barcodeNumber: 'BC001', user: actor }),
    ).rejects.toThrow(NotFoundError);
  });
});

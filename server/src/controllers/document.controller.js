'use strict';

const fs = require('fs');

const documentService = require('../services/documentService');
const searchService = require('../services/searchService');
const workflowService = require('../services/workflowService');
const asyncWrapper = require('../utils/asyncWrapper');
const { NotFoundError } = require('../utils/errors');
const { parsePagination, paginate } = require('../utils/paginate');

const upload = asyncWrapper(async (req, res) => {
  const document = await documentService.uploadDocument({
    file: req.file,
    body: req.body,
    user: req.user,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });
  res.status(201).json({ success: true, data: document });
});

const list = asyncWrapper(async (req, res) => {
  const result = await documentService.listDocuments({
    query: req.query,
    user: req.user,
  });
  res.json({ success: true, ...result });
});

const getById = asyncWrapper(async (req, res) => {
  const document = await documentService.getDocumentById({
    id: parseInt(req.params.id, 10),
    user: req.user,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });
  res.json({ success: true, data: document });
});

const download = asyncWrapper(async (req, res) => {
  const { absolutePath, mimeType, filename } = await documentService.downloadDocument({
    id: parseInt(req.params.id, 10),
    user: req.user,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  if (!fs.existsSync(absolutePath)) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'File not found on disk' },
    });
  }

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  fs.createReadStream(absolutePath).pipe(res);
});

const setBarcode = asyncWrapper(async (req, res) => {
  const result = await documentService.setBarcode({
    id: parseInt(req.params.id, 10),
    barcodeNumber: req.body.barcode_number,
    user: req.user,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });
  res.json({ success: true, data: result });
});

const changeStatus = asyncWrapper(async (req, res) => {
  const document = await workflowService.transition({
    documentId: parseInt(req.params.id, 10),
    toStatus: req.body.status,
    actor: req.user,
    note: req.body.note,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });
  res.json({ success: true, data: document });
});

const getHistory = asyncWrapper(async (req, res) => {
  const docId = parseInt(req.params.id, 10);

  // Verify document exists and is accessible (reuse existing service check)
  const doc = await documentService.getDocumentById({
    id: docId,
    user: req.user,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });
  if (!doc) throw new NotFoundError('Document not found');

  const history = await workflowService.getHistory(docId);
  const { page, limit } = parsePagination(req.query);
  const sliced = history.slice((page - 1) * limit, page * limit);

  res.json({ success: true, ...paginate(sliced, history.length, page, limit) });
});

const createVersion = asyncWrapper(async (req, res) => {
  const doc = await documentService.createVersion({
    id: parseInt(req.params.id, 10),
    file: req.file,
    actor: req.user,
    changeNote: req.body.change_note || null,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });
  res.status(201).json({ success: true, data: doc });
});

const listVersions = asyncWrapper(async (req, res) => {
  const versions = await documentService.listVersions({
    id: parseInt(req.params.id, 10),
    actor: req.user,
  });
  res.json({ success: true, data: versions });
});

const downloadVersion = asyncWrapper(async (req, res) => {
  const version = await documentService.getVersion({
    id: parseInt(req.params.id, 10),
    versionId: parseInt(req.params.versionId, 10),
    actor: req.user,
  });

  const storageService = require('../services/storageService');
  const absolutePath = storageService.resolvePath(version.file_path);

  if (!fs.existsSync(absolutePath)) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'File not found on disk' },
    });
  }

  const path = require('path');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(path.basename(version.file_path))}"`,
  );
  fs.createReadStream(absolutePath).pipe(res);
});

const remove = asyncWrapper(async (req, res) => {
  await documentService.deleteDocument({
    id: parseInt(req.params.id, 10),
    user: req.user,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });
  res.status(204).end();
});

const search = asyncWrapper(async (req, res) => {
  const result = await searchService.search(req.query, req.user);
  res.json({ success: true, ...result });
});

module.exports = {
  upload,
  list,
  getById,
  download,
  setBarcode,
  changeStatus,
  getHistory,
  createVersion,
  listVersions,
  downloadVersion,
  remove,
  search,
};

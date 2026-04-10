'use strict';

const multer = require('multer');
const { ValidationError } = require('../utils/errors');

/**
 * Allowed MIME types mapped to their magic byte signatures.
 * Magic bytes are checked against the actual file buffer to prevent
 * spoofed Content-Type headers.
 */
const MAGIC_BYTES = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function detectMime(buffer) {
  for (const [mime, magic] of Object.entries(MAGIC_BYTES)) {
    if (magic.every((byte, i) => buffer[i] === byte)) {
      return mime;
    }
  }
  return null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter(req, file, cb) {
    if (!Object.prototype.hasOwnProperty.call(MAGIC_BYTES, file.mimetype)) {
      return cb(new ValidationError('Only PDF, JPEG, and PNG files are allowed'));
    }
    cb(null, true);
  },
});

/**
 * Validates the actual file content against known magic byte signatures.
 * Must run after multer has populated req.file (buffer in memory).
 * Overwrites req.file.mimetype with the detected type to prevent spoofing.
 */
function validateMagicBytes(req, res, next) {
  if (!req.file) {
    return next(new ValidationError('A file is required'));
  }

  const detectedMime = detectMime(req.file.buffer);
  if (!detectedMime) {
    return next(new ValidationError('File content does not match an allowed type (PDF, JPEG, PNG)'));
  }

  req.file.mimetype = detectedMime;
  return next();
}

module.exports = { upload, validateMagicBytes };

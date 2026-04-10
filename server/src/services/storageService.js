'use strict';

const fs = require('fs');
const path = require('path');

const UPLOAD_ROOT = path.resolve(__dirname, '../../uploads/documents');

/**
 * Sanitise a client-supplied filename.
 * Strips path separators and replaces any character that is not a letter,
 * digit, hyphen, underscore, or dot with an underscore.
 *
 * @param {string} name
 * @returns {string}
 */
function sanitiseName(name) {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Save a file buffer to disk.
 * Final path: uploads/documents/{referenceNumber}/v{version}/{sanitisedName}
 *
 * @param {object} params
 * @param {Buffer} params.buffer
 * @param {string} params.referenceNumber
 * @param {number} params.version
 * @param {string} params.originalName  Client-supplied filename (will be sanitised).
 * @returns {string}  Relative path from the server root (stored in the DB).
 */
function saveFile({ buffer, referenceNumber, version, originalName }) {
  const safeName = sanitiseName(originalName);
  const dir = path.join(UPLOAD_ROOT, referenceNumber, `v${version}`);
  fs.mkdirSync(dir, { recursive: true });

  const absPath = path.join(dir, safeName);
  fs.writeFileSync(absPath, buffer);

  const serverRoot = path.resolve(__dirname, '../..');
  return path.relative(serverRoot, absPath);
}

/**
 * Delete a file from disk.
 *
 * @param {string} relativePath  As stored in the database.
 */
function deleteFile(relativePath) {
  const absPath = resolvePath(relativePath);
  if (fs.existsSync(absPath)) {
    fs.unlinkSync(absPath);
  }
}

/**
 * Resolve a DB-stored relative path to an absolute filesystem path.
 *
 * @param {string} relativePath
 * @returns {string}
 */
function resolvePath(relativePath) {
  const serverRoot = path.resolve(__dirname, '../..');
  return path.resolve(serverRoot, relativePath);
}

module.exports = { saveFile, deleteFile, resolvePath };

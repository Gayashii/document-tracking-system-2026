'use strict';

const db = require('../config/db');

const DIGITS = '0123456789';
const LENGTH = 12; // 12 digits → 10^12 = 1 trillion combinations; compatible with Code 128

/**
 * Generate a cryptographically random 12-digit numeric barcode string.
 * Compatible with Code 128 physical barcode printers and USB/Bluetooth readers.
 */
function generateCode() {
  const bytes = require('crypto').randomBytes(LENGTH);
  return Array.from(bytes, (b) => DIGITS[b % 10]).join('');
}

/**
 * Generate a unique barcode number not already present in the documents table.
 * Retries up to 5 times on collision (extremely unlikely in practice).
 *
 * @param {import('knex').Knex} [trx] Optional Knex transaction
 * @returns {Promise<string>}
 */
async function generateBarcode(trx) {
  const qb = trx ?? db;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const existing = await qb('documents')
      .where({ barcode_number: code })
      .whereNull('deleted_at')
      .first();
    if (!existing) return code;
  }
  throw new Error('Failed to generate a unique barcode after 5 attempts');
}

module.exports = { generateBarcode };

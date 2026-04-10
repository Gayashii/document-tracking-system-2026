'use strict';

const db = require('../config/db');

/**
 * Generate the next PGI-YYYY-NNNNNN reference number atomically.
 * Uses the `sequences` table with a SELECT ... FOR UPDATE to prevent races.
 *
 * @param {import('knex').Knex.Transaction} [trx]  Pass an existing transaction if available.
 * @returns {Promise<string>}  e.g. "PGI-2026-000001"
 */
async function generateReferenceNumber(trx) {
  const qb = trx || db;

  const [seq] = await qb('sequences')
    .where({ name: 'document_reference' })
    .forUpdate()
    .increment('current_value', 1)
    .returning(['current_value']);

  const year = new Date().getFullYear();
  const padded = String(seq.current_value).padStart(6, '0');
  return `PGI-${year}-${padded}`;
}

module.exports = { generateReferenceNumber };

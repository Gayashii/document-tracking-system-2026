'use strict';

/**
 * Search adapter — single entry point for document search.
 *
 * Currently delegates to PostgreSQL FTS via documentService.
 * To switch to Elasticsearch, replace the import below and swap
 * `documentService.search` for `elasticService.search` — one line change.
 */
const documentService = require('./documentService');

async function search(filters, actor) {
  return documentService.search(filters, actor);
}

module.exports = { search };

'use strict';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Parse pagination params from query string.
 *
 * @param {{ page?: string|number, limit?: string|number }} query
 * @returns {{ page: number, limit: number, offset: number }}
 */
function parsePagination(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || DEFAULT_PAGE);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Build a standard paginated response envelope.
 *
 * @param {Array}  data
 * @param {number} total   Total row count (before pagination)
 * @param {number} page
 * @param {number} limit
 * @returns {{ data: Array, pagination: object }}
 */
function paginate(data, total, page, limit) {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

module.exports = { parsePagination, paginate };

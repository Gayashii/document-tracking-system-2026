'use strict';

/**
 * Wraps an async Express route handler and forwards any rejection to next().
 *
 * @param {Function} fn  Async route handler (req, res, next) => Promise
 * @returns {Function}
 */
module.exports = function asyncWrapper(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

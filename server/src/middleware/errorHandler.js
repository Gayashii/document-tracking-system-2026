'use strict';

const { AppError } = require('../utils/errors');

/**
 * Centralised error handler.
 * Always returns: { success: false, error: { code, message, details? } }
 */
// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && { details: err.details }),
      },
    });
  }

  // Joi validation errors surfaced via validate middleware
  if (err.isJoi) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.details.map((d) => ({ field: d.path.join('.'), message: d.message })),
      },
    });
  }

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: { code: 'FILE_TOO_LARGE', message: err.message },
    });
  }

  // SyntaxError from JSON body parser
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_JSON', message: 'Request body contains invalid JSON' },
    });
  }

  // Unexpected error — log full details, hide internals from client
  const logger = req.app.get('logger');
  if (logger) {
    logger.error('Unhandled error', { error: err.message, stack: err.stack, url: req.url });
  }

  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' },
  });
};

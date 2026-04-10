'use strict';

const winston = require('winston');

function createLogger(level = 'info') {
  return winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    ),
    transports: [new winston.transports.Console()],
  });
}

function requestLogger(logger) {
  return function (req, res, next) {
    const start = Date.now();

    res.on('finish', () => {
      logger.http('HTTP request', {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration_ms: Date.now() - start,
        ip: req.ip,
        user_agent: req.get('user-agent'),
      });
    });

    next();
  };
}

module.exports = { createLogger, requestLogger };

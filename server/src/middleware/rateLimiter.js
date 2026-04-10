'use strict';

const rateLimit = require('express-rate-limit');

const onLimitReached = (req, res) => {
  res.status(429).json({
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
    },
  });
};

const isTest = process.env.NODE_ENV === 'test';
const noop   = (_req, _res, next) => next();

/** Auth routes: 10 requests per 15 minutes */
const authLimiter = isTest ? noop : rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: onLimitReached,
});

/** General API routes: 100 requests per minute */
const generalLimiter = isTest ? noop : rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: onLimitReached,
});

/** Export routes: 5 requests per minute */
const exportLimiter = isTest ? noop : rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: onLimitReached,
});

/** Public scan endpoint: 20 requests per minute per IP */
const scanLimiter = isTest ? noop : rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: onLimitReached,
});

module.exports = { authLimiter, generalLimiter, exportLimiter, scanLimiter };

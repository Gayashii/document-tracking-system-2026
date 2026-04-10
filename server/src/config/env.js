'use strict';

const Joi = require('joi');

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().integer().default(3000),
  API_PREFIX: Joi.string().default('/api/v1'),

  // Database
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().integer().default(5432),
  DB_NAME: Joi.string().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').default(''),

  // JWT
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().integer().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),

  // File storage
  UPLOAD_DIR: Joi.string().default('uploads/documents'),
  THUMBNAIL_DIR: Joi.string().default('uploads/thumbnails'),
  MAX_FILE_SIZE_MB: Joi.number().integer().default(20),
  ALLOWED_MIME_TYPES: Joi.string().default('application/pdf,image/jpeg,image/png'),

  // Email
  SMTP_HOST: Joi.string().default('localhost'),
  SMTP_PORT: Joi.number().integer().default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASSWORD: Joi.string().allow('').default(''),
  EMAIL_FROM: Joi.string().default('Document Tracking System <noreply@example.com>'),

  // MFA
  MFA_ISSUER: Joi.string().default('DocTrackingSystem'),

  // Encryption
  ENCRYPTION_KEY: Joi.string().length(64).required(),

  // Logging
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'http', 'debug').default('info'),

  // CORS
  CORS_ORIGINS: Joi.string().default('http://localhost:4200'),
}).unknown(true);

const { error, value } = schema.validate(process.env, { abortEarly: false, stripUnknown: true });

if (error) {
  const missing = error.details.map((d) => d.message).join('\n  ');
  throw new Error(`Environment configuration error:\n  ${missing}`);
}

module.exports = value;

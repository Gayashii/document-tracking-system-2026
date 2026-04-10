'use strict';

const Joi = require('joi');
const { ROLES } = require('../constants/roles');

const password = Joi.string()
  .min(8)
  .max(128)
  .pattern(/[A-Z]/, 'uppercase letter')
  .pattern(/[a-z]/, 'lowercase letter')
  .pattern(/[0-9]/, 'number')
  .pattern(/[^A-Za-z0-9]/, 'special character')
  .messages({
    'string.pattern.name': 'Password must contain at least one {#name}',
  });

const registerSchema = Joi.object({
  email: Joi.string().email().max(255).required(),
  password: password.required(),
  role: Joi.string()
    .valid(ROLES.ADMIN, ROLES.FINANCE_STAFF, ROLES.STUDENT, ROLES.AUDITOR)
    .default(ROLES.STUDENT),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
});

const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  newPassword: password.required(),
});

module.exports = { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema };

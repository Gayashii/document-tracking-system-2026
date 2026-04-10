'use strict';

const express    = require('express');
const router     = express.Router();
const Joi        = require('joi');
const authenticate    = require('../middleware/authenticate');
const authorize       = require('../middleware/authorize');
const validate        = require('../middleware/validate');
const { generalLimiter } = require('../middleware/rateLimiter');
const controller      = require('../controllers/user.controller');
const { PERMISSIONS } = require('../constants/roles');
const { ROLES }       = require('../constants/roles');

router.use(authenticate, generalLimiter);

const createUserSchema = Joi.object({
  email:    Joi.string().email().max(255).required(),
  password: Joi.string().min(8).max(128).required(),
  role:     Joi.string().valid(ROLES.ADMIN, ROLES.FINANCE_STAFF, ROLES.STUDENT, ROLES.AUDITOR).default(ROLES.STUDENT),
});

const updateUserSchema = Joi.object({
  role:      Joi.string().valid(ROLES.ADMIN, ROLES.FINANCE_STAFF, ROLES.STUDENT, ROLES.AUDITOR).optional(),
  is_active: Joi.boolean().optional(),
}).min(1);

const idSchema = Joi.object({ id: Joi.number().integer().positive().required() });

// GET /users — list with search/filter
router.get('/',         authorize(PERMISSIONS.USER_READ_ANY),   controller.list);

// POST /users — admin creates a user
router.post('/',        authorize(PERMISSIONS.USER_CREATE),     validate(createUserSchema, 'body'),  controller.create);

// PATCH /users/:id — update role / is_active
router.patch('/:id',    authorize(PERMISSIONS.USER_UPDATE_ANY), validate(idSchema, 'params'), validate(updateUserSchema, 'body'), controller.update);

// DELETE /users/:id — deactivate (soft)
router.delete('/:id',   authorize(PERMISSIONS.USER_DELETE),     validate(idSchema, 'params'), controller.deactivate);

// POST /users/:id/mfa/reset — force re-enrolment
router.post('/:id/mfa/reset', authorize(PERMISSIONS.USER_UPDATE_ANY), validate(idSchema, 'params'), controller.resetMfa);

module.exports = router;

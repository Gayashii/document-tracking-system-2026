'use strict';

const express  = require('express');
const router   = express.Router();
const Joi      = require('joi');
const authenticate    = require('../middleware/authenticate');
const authorize       = require('../middleware/authorize');
const validate        = require('../middleware/validate');
const { generalLimiter } = require('../middleware/rateLimiter');
const controller      = require('../controllers/department.controller');
const { PERMISSIONS } = require('../constants/roles');

router.use(authenticate, generalLimiter);

const createSchema = Joi.object({
  name:        Joi.string().min(1).max(100).required(),
  code:        Joi.string().min(1).max(20).required(),
  description: Joi.string().max(500).optional().allow(''),
});
const updateSchema = Joi.object({
  name:        Joi.string().min(1).max(100).optional(),
  code:        Joi.string().min(1).max(20).optional(),
  description: Joi.string().max(500).optional().allow(''),
}).min(1);
const idSchema = Joi.object({ id: Joi.number().integer().positive().required() });

router.get('/',      authorize(PERMISSIONS.SETTINGS_MANAGE), controller.list);
router.post('/',     authorize(PERMISSIONS.DEPARTMENT_MANAGE), validate(createSchema, 'body'), controller.create);
router.patch('/:id', authorize(PERMISSIONS.DEPARTMENT_MANAGE), validate(idSchema, 'params'), validate(updateSchema, 'body'), controller.update);
router.delete('/:id',authorize(PERMISSIONS.DEPARTMENT_MANAGE), validate(idSchema, 'params'), controller.remove);

module.exports = router;

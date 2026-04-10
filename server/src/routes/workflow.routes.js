'use strict';

const express    = require('express');
const router     = express.Router();
const Joi        = require('joi');
const authenticate     = require('../middleware/authenticate');
const authorize        = require('../middleware/authorize');
const validate         = require('../middleware/validate');
const { generalLimiter } = require('../middleware/rateLimiter');
const controller   = require('../controllers/workflow.controller');
const { PERMISSIONS } = require('../constants/roles');

router.use(authenticate, generalLimiter);

const stepSchema = Joi.object({
  phase_label:      Joi.string().max(255).required(),
  assigned_user_id: Joi.number().integer().positive().required(),
});

const createSchema = Joi.object({
  name:             Joi.string().max(255).required(),
  document_type_id: Joi.number().integer().positive().allow(null).default(null),
});

const updateSchema = Joi.object({
  name:             Joi.string().max(255),
  document_type_id: Joi.number().integer().positive().allow(null),
}).min(1);

const replaceStepsSchema = Joi.object({
  steps: Joi.array().items(stepSchema).min(1).required(),
});

// All workflow management is admin-only
const adminOnly = authorize(PERMISSIONS.WORKFLOW_MANAGE);

router.get('/',           adminOnly, controller.list);
router.get('/:id',        adminOnly, controller.getOne);
router.post('/',          adminOnly, validate(createSchema),      controller.create);
router.patch('/:id',      adminOnly, validate(updateSchema),      controller.update);
router.put('/:id/steps',  adminOnly, validate(replaceStepsSchema), controller.replaceSteps);
router.delete('/:id',     adminOnly, controller.remove);

module.exports = router;

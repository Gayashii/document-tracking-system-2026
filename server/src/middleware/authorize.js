'use strict';

const { ForbiddenError } = require('../utils/errors');
const { AUDIT_ACTIONS } = require('../constants/auditActions');

/**
 * Role-check middleware factory.
 *
 * @param {string[]} allowedRoles
 * @returns {import('express').RequestHandler}
 *
 * @example
 *   router.delete('/users/:id', authenticate, authorize(['admin']), handler);
 */
module.exports = function authorize(allowedRoles) {
  return function (req, res, next) {
    if (!req.user) {
      return next(new ForbiddenError('Insufficient role'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      // Fire-and-forget audit log — must not block or alter the 403 response
      const auditService = require('../services/auditService');
      auditService
        .log({
          actorId: req.user.id,
          action: AUDIT_ACTIONS.ACCESS_DENIED,
          entityType: 'route',
          metadata: { method: req.method, path: req.path, requiredRoles: allowedRoles },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        })
        .catch(() => {});

      return next(new ForbiddenError('Insufficient role'));
    }

    return next();
  };
};

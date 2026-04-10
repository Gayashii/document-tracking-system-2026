'use strict';

/**
 * Joi validation middleware factory.
 *
 * @param {import('joi').ObjectSchema} schema
 * @param {'body'|'params'|'query'} [target='body']
 */
module.exports = function validate(schema, target = 'body') {
  return function (req, res, next) {
    const { error, value } = schema.validate(req[target], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.details.map((d) => ({
            field: d.path.join('.'),
            message: d.message,
          })),
        },
      });
    }

    req[target] = value;
    return next();
  };
};

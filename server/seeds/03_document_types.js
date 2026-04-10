'use strict';

/** @param {import('knex').Knex} knex */
exports.seed = async function (knex) {
  const types = [
    { name: 'Payment Receipt',        code: 'PAY_RECEIPT' },
    { name: 'Scholarship Application',code: 'SCHOLARSHIP' },
    { name: 'Fee Application',        code: 'FEE_APP' },
    { name: 'Refund Request',         code: 'REFUND' },
    { name: 'Other Financial Document', code: 'OTHER' },
  ];

  for (const type of types) {
    const existing = await knex('document_types').where({ code: type.code }).first();
    if (!existing) {
      await knex('document_types').insert({ ...type, is_active: true });
    }
  }
};

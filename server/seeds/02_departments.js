'use strict';

/** @param {import('knex').Knex} knex */
exports.seed = async function (knex) {
  const departments = [
    { name: 'Financial Section', code: 'FIN' },
    { name: 'Postgraduate Studies', code: 'PGS' },
    { name: 'Academic Affairs', code: 'ACA' },
    { name: 'Student Services', code: 'STU' },
  ];

  for (const dept of departments) {
    const existing = await knex('departments').where({ code: dept.code }).first();
    if (!existing) {
      await knex('departments').insert(dept);
    }
  }
};

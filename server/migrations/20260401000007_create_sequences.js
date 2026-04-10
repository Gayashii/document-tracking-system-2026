'use strict';

/** @param {import('knex').Knex} knex */
exports.up = async function (knex) {
  await knex.schema.createTable('sequences', (t) => {
    t.increments('id').primary();
    t.string('name', 100).notNullable().unique();
    t.integer('current_value').notNullable().defaultTo(0);
  });

  await knex('sequences').insert({ name: 'document_reference', current_value: 0 });
};

/** @param {import('knex').Knex} knex */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('sequences');
};

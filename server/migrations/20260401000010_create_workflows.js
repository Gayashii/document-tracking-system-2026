'use strict';

/** @param {import('knex').Knex} knex */
exports.up = async function (knex) {
  await knex.schema.createTable('workflows', (t) => {
    t.increments('id').primary();
    t.string('name', 255).notNullable();
    t.integer('document_type_id')
      .nullable()
      .references('id')
      .inTable('document_types')
      .onDelete('SET NULL');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('workflows');
};

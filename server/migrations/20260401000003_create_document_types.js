'use strict';

/** @param {import('knex').Knex} knex */
exports.up = function (knex) {
  return knex.schema.createTable('document_types', (t) => {
    t.increments('id').primary();
    t.string('name', 255).notNullable();
    t.string('code', 50).nullable().unique();
    t.text('description').nullable();
    t.boolean('requires_approval').notNullable().defaultTo(true);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
};

/** @param {import('knex').Knex} knex */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('document_types');
};

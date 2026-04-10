'use strict';

/** @param {import('knex').Knex} knex */
exports.up = function (knex) {
  return knex.schema.createTable('document_status_history', (t) => {
    t.increments('id').primary();
    t.integer('document_id')
      .notNullable()
      .references('id')
      .inTable('documents')
      .onDelete('CASCADE');
    t.specificType('from_status', 'document_status').nullable();
    t.specificType('to_status', 'document_status').notNullable();
    t.integer('changed_by')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    t.text('note').nullable();
    t.string('ip_address', 45).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index('document_id');
  });
};

/** @param {import('knex').Knex} knex */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('document_status_history');
};

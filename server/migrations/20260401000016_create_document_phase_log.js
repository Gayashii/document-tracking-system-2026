'use strict';

/** @param {import('knex').Knex} knex */
exports.up = async function (knex) {
  await knex.schema.createTable('document_phase_log', (t) => {
    t.increments('id').primary();
    t.integer('document_id')
      .notNullable()
      .references('id')
      .inTable('documents')
      .onDelete('CASCADE');
    t.integer('workflow_step_id')
      .nullable()
      .references('id')
      .inTable('workflow_steps')
      .onDelete('SET NULL');
    t.integer('actor_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    t.enum('action', ['assigned', 'advanced', 'returned', 'resolved']).notNullable();
    t.text('note').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index('document_id');
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('document_phase_log');
};

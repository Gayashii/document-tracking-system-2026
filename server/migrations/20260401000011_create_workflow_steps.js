'use strict';

/** @param {import('knex').Knex} knex */
exports.up = async function (knex) {
  await knex.schema.createTable('workflow_steps', (t) => {
    t.increments('id').primary();
    t.integer('workflow_id')
      .notNullable()
      .references('id')
      .inTable('workflows')
      .onDelete('CASCADE');
    t.integer('step_order').notNullable();
    t.string('phase_label', 255).notNullable();
    t.integer('assigned_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.unique(['workflow_id', 'step_order']);
  });

  // Add the FK on documents.current_workflow_step_id now that workflow_steps exists
  await knex.schema.alterTable('documents', (t) => {
    t.foreign('current_workflow_step_id')
      .references('id')
      .inTable('workflow_steps')
      .onDelete('SET NULL');
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function (knex) {
  await knex.schema.alterTable('documents', (t) => {
    t.dropForeign('current_workflow_step_id');
  });
  await knex.schema.dropTableIfExists('workflow_steps');
};

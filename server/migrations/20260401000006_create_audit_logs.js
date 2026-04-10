'use strict';

/** @param {import('knex').Knex} knex */
exports.up = function (knex) {
  return knex.schema.createTable('audit_logs', (t) => {
    t.increments('id').primary();
    t.integer('actor_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    t.string('action', 100).notNullable();
    t.string('entity_type', 100).notNullable();
    t.integer('entity_id').nullable();
    t.jsonb('metadata').nullable();
    t.string('ip_address', 45).nullable();
    t.text('user_agent').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['actor_id', 'created_at']);
    t.index('entity_type');
    t.index('created_at');
  });
};

/** @param {import('knex').Knex} knex */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('audit_logs');
};

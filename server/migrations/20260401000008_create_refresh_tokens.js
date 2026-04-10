'use strict';

/** @param {import('knex').Knex} knex */
exports.up = function (knex) {
  return knex.schema.createTable('refresh_tokens', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('token_hash', 64).notNullable().unique();
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('revoked_at', { useTz: true }).nullable();

    t.index('user_id');
    t.index('token_hash');
  });
};

/** @param {import('knex').Knex} knex */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('refresh_tokens');
};

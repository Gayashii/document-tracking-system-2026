'use strict';

/** @param {import('knex').Knex} knex */
exports.up = async function (knex) {
  await knex.raw(`CREATE TYPE user_role AS ENUM ('admin', 'finance_staff', 'student', 'auditor')`);

  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.string('email', 255).notNullable().unique();
    t.string('password_hash', 255).notNullable();
    t.specificType('role', 'user_role').notNullable().defaultTo('student');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('last_login_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('users');
  await knex.raw(`DROP TYPE IF EXISTS user_role`);
};

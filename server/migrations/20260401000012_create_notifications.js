'use strict';

/** @param {import('knex').Knex} knex */
exports.up = async function (knex) {
  await knex.raw(`CREATE TYPE notification_type   AS ENUM ('email', 'in_app')`);
  await knex.raw(`CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed')`);

  await knex.schema.createTable('notifications', (t) => {
    t.increments('id').primary();
    t.integer('recipient_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    t.specificType('type',   'notification_type').notNullable();
    t.specificType('status', 'notification_status').notNullable().defaultTo('pending');
    t.string('subject', 255).nullable();
    t.text('body').notNullable();
    t.timestamp('sent_at',    { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['recipient_id', 'status']);
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('notifications');
  await knex.raw(`DROP TYPE IF EXISTS notification_status`);
  await knex.raw(`DROP TYPE IF EXISTS notification_type`);
};

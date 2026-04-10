'use strict';

/** @param {import('knex').Knex} knex */
exports.up = async function (knex) {
  await knex.schema.createTable('document_versions', (t) => {
    t.increments('id').primary();
    t.integer('document_id')
      .notNullable()
      .references('id')
      .inTable('documents')
      .onDelete('CASCADE');
    t.integer('version_number').notNullable();
    t.string('file_path', 500).notNullable();
    t.integer('uploaded_by')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    t.text('change_note').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.unique(['document_id', 'version_number']);
    t.index(['document_id', 'version_number']);
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('document_versions');
};

'use strict';

/** @param {import('knex').Knex} knex */
exports.up = async function (knex) {
  await knex.raw(
    `CREATE TYPE document_status AS ENUM ('submitted', 'pending_approval', 'approved', 'rejected', 'processed')`,
  );

  await knex.schema.createTable('documents', (t) => {
    t.increments('id').primary();
    t.string('reference_number', 20).notNullable().unique();
    t.string('title', 255).notNullable();
    t.integer('document_type_id')
      .nullable()
      .references('id')
      .inTable('document_types')
      .onDelete('RESTRICT');
    t.integer('department_id')
      .nullable()
      .references('id')
      .inTable('departments')
      .onDelete('RESTRICT');
    t.integer('student_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    t.integer('assigned_to_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    // current_workflow_step_id FK is added in create_workflow_steps migration
    t.integer('current_workflow_step_id').nullable();
    t.specificType('status', 'document_status').notNullable().defaultTo('submitted');
    t.string('file_path', 500).notNullable();
    t.bigInteger('file_size').notNullable();
    t.string('mime_type', 100).notNullable();
    t.string('academic_year', 20).nullable();
    t.string('semester', 20).nullable();
    t.decimal('financial_amount', 12, 2).nullable();
    t.string('barcode_number', 20).nullable().unique();
    t.integer('version').notNullable().defaultTo(1);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('deleted_at', { useTz: true }).nullable();
  });

  await knex.schema.table('documents', (t) => {
    t.index('status');
    t.index('student_id');
    t.index('created_at');
    t.index('reference_number');
    t.index('department_id');
    t.index('deleted_at');
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('documents');
  await knex.raw(`DROP TYPE IF EXISTS document_status`);
};

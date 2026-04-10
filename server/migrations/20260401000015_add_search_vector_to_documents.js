'use strict';

/** @param {import('knex').Knex} knex */
exports.up = async function (knex) {
  await knex.schema.table('documents', (t) => {
    t.specificType('search_vector', 'tsvector').nullable();
  });

  await knex.raw('CREATE INDEX idx_documents_fts ON documents USING GIN(search_vector)');

  await knex.raw(`
    CREATE OR REPLACE FUNCTION documents_search_vector_update()
    RETURNS trigger AS $$
    BEGIN
      NEW.search_vector := to_tsvector(
        'english',
        coalesce(NEW.title, '') || ' ' ||
        coalesce((SELECT name  FROM document_types WHERE id = NEW.document_type_id), '') || ' ' ||
        coalesce((SELECT email FROM users          WHERE id = NEW.student_id),        '')
      );
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE TRIGGER documents_search_vector_trigger
    BEFORE INSERT OR UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION documents_search_vector_update();
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function (knex) {
  await knex.raw('DROP TRIGGER  IF EXISTS documents_search_vector_trigger ON documents');
  await knex.raw('DROP FUNCTION IF EXISTS documents_search_vector_update()');
  await knex.raw('DROP INDEX    IF EXISTS idx_documents_fts');
  await knex.schema.table('documents', (t) => {
    t.dropColumn('search_vector');
  });
};

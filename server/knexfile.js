'use strict';

require('dotenv').config();

/** @type {import('knex').Knex.Config} */
const base = {
  client: 'pg',
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './seeds',
  },
};

/** @type {Object.<string, import('knex').Knex.Config>} */
module.exports = {
  development: {
    ...base,
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'doc_tracking',
      user: process.env.DB_USER || 'doc_user',
      password: process.env.DB_PASSWORD || 'changeme',
    },
    pool: { min: 2, max: 10 },
  },

  test: {
    ...base,
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'doc_tracking_test',
      user: process.env.DB_USER || 'doc_user',
      password: process.env.DB_PASSWORD || 'changeme',
    },
    pool: { min: 1, max: 5 },
  },

  production: {
    ...base,
    connection: {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: { rejectUnauthorized: true },
    },
    pool: { min: 2, max: 20 },
  },
};

'use strict';

const bcrypt = require('bcryptjs');

/** @param {import('knex').Knex} knex */
exports.seed = async function (knex) {
  const existing = await knex('users').where({ email: 'admin@pgi.ac.lk' }).first();
  if (existing) return;

  const passwordHash = await bcrypt.hash('Admin@1234', 12);

  await knex('users').insert({
    email: 'admin@pgi.ac.lk',
    password_hash: passwordHash,
    role: 'admin',
    is_active: true,
  });
};

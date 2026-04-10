'use strict';

const bcrypt = require('bcryptjs');

/** @param {import('knex').Knex} knex */
exports.seed = async function (knex) {
  const email = 'auditor@pgi.ac.lk';
  const existing = await knex('users').where({ email }).first();
  if (!existing) {
    const passwordHash = await bcrypt.hash('Auditor@1234', 12);
    await knex('users').insert({
      email,
      password_hash: passwordHash,
      role: 'auditor',
      is_active: true,
    });
  }
};

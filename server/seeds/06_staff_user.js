'use strict';

const bcrypt = require('bcryptjs');

/** @param {import('knex').Knex} knex */
exports.seed = async function (knex) {
  const existing = await knex('users').where({ email: 'staff@pgi.ac.lk' }).first();
  if (existing) return;

  const passwordHash = await bcrypt.hash('Staff@1234', 12);

  await knex('users').insert({
    email: 'staff@pgi.ac.lk',
    password_hash: passwordHash,
    role: 'finance_staff',
    is_active: true,
  });
};

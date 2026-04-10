'use strict';

const bcrypt = require('bcryptjs');

const STAFF = [
  { email: 'staff2@pgi.ac.lk' },
  { email: 'staff3@pgi.ac.lk' },
  { email: 'staff4@pgi.ac.lk' },
  { email: 'staff5@pgi.ac.lk' },
];

/** @param {import('knex').Knex} knex */
exports.seed = async function (knex) {
  const passwordHash = await bcrypt.hash('Staff@1234', 12);

  for (const user of STAFF) {
    const existing = await knex('users').where({ email: user.email }).first();
    if (!existing) {
      await knex('users').insert({
        email: user.email,
        password_hash: passwordHash,
        role: 'finance_staff',
        is_active: true,
      });
    }
  }
};

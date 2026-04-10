'use strict';

/** @param {import('knex').Knex} knex */
exports.seed = async function (knex) {
  const defaults = [
    { key: 'max_file_size_mb',            value: '10' },
    { key: 'allowed_mime_types',          value: 'application/pdf,image/jpeg,image/png' },
    { key: 'session_timeout_minutes',     value: '60' },
    { key: 'overdue_threshold_days',      value: '5' },
    { key: 'mfa_required_roles',          value: 'admin,finance_staff' },
    { key: 'email_notifications_enabled', value: 'true' },
  ];

  for (const setting of defaults) {
    const existing = await knex('system_settings').where({ key: setting.key }).first();
    if (!existing) {
      await knex('system_settings').insert(setting);
    }
  }
};

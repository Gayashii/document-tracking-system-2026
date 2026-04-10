'use strict';

const ROLES = Object.freeze({
  ADMIN: 'admin',
  FINANCE_STAFF: 'finance_staff',
  STUDENT: 'student',
  AUDITOR: 'auditor',
});

/**
 * Permission matrix — each role lists what it can do.
 * Used by authorize.js middleware to gate endpoints.
 */
const PERMISSIONS = Object.freeze({
  // User management
  USER_CREATE: [ROLES.ADMIN],
  USER_READ_ANY: [ROLES.ADMIN],
  USER_UPDATE_ANY: [ROLES.ADMIN],
  USER_DELETE: [ROLES.ADMIN],

  // Document management
  DOCUMENT_UPLOAD: [ROLES.ADMIN, ROLES.FINANCE_STAFF, ROLES.STUDENT],
  DOCUMENT_READ_ANY: [ROLES.ADMIN, ROLES.FINANCE_STAFF, ROLES.AUDITOR],
  DOCUMENT_READ_OWN: [ROLES.STUDENT],
  DOCUMENT_UPDATE: [ROLES.ADMIN, ROLES.FINANCE_STAFF],
  DOCUMENT_DELETE: [ROLES.ADMIN],
  DOCUMENT_APPROVE: [ROLES.ADMIN, ROLES.FINANCE_STAFF],

  // Status workflow (all roles that can ever trigger a transition)
  WORKFLOW_ADVANCE: [ROLES.ADMIN, ROLES.FINANCE_STAFF],
  DOCUMENT_STATUS_CHANGE: [ROLES.ADMIN, ROLES.FINANCE_STAFF, ROLES.STUDENT],

  // Reports & audit
  REPORT_VIEW: [ROLES.ADMIN, ROLES.FINANCE_STAFF, ROLES.AUDITOR],
  AUDIT_VIEW: [ROLES.ADMIN, ROLES.AUDITOR],

  // Document versions (owner can create; owner + staff + admin + auditor can read)
  DOCUMENT_VERSION_CREATE: [ROLES.STUDENT],
  DOCUMENT_VERSION_READ: [ROLES.ADMIN, ROLES.FINANCE_STAFF, ROLES.STUDENT, ROLES.AUDITOR],

  // Notifications (all authenticated roles may manage their own notifications)
  NOTIFICATION_VIEW: [ROLES.ADMIN, ROLES.FINANCE_STAFF, ROLES.STUDENT, ROLES.AUDITOR],

  // Admin panel
  SETTINGS_MANAGE: [ROLES.ADMIN],
  DEPARTMENT_MANAGE: [ROLES.ADMIN],
  DOCUMENT_TYPE_MANAGE: [ROLES.ADMIN],

  // Workflow templates (admin only)
  WORKFLOW_MANAGE: [ROLES.ADMIN],

  // Document assignment (admin or staff)
  DOCUMENT_ASSIGN: [ROLES.ADMIN, ROLES.FINANCE_STAFF],

  // Phase actions — gated further in business logic (must be current assignee)
  DOCUMENT_PHASE_ACTION: [ROLES.ADMIN, ROLES.FINANCE_STAFF],
});

module.exports = { ROLES, PERMISSIONS };

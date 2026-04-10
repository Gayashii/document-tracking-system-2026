'use strict';

/**
 * Workflow state machine.
 * Maps each status to the set of statuses it may transition to,
 * and which roles are permitted to trigger the transition.
 *
 * This is the central business logic file for the document workflow.
 */

const { ROLES } = require('./roles');

const STATUSES = Object.freeze({
  SUBMITTED: 'submitted',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PROCESSED: 'processed',
});

/**
 * transitions[fromStatus] = [
 *   { to, allowedRoles[], label }
 * ]
 */
const TRANSITIONS = Object.freeze({
  [STATUSES.SUBMITTED]: [
    {
      to: STATUSES.PENDING_APPROVAL,
      allowedRoles: [ROLES.ADMIN, ROLES.FINANCE_STAFF],
      label: 'Submit for review',
    },
    {
      to: STATUSES.REJECTED,
      allowedRoles: [ROLES.ADMIN, ROLES.FINANCE_STAFF],
      label: 'Reject at submission',
    },
  ],
  [STATUSES.PENDING_APPROVAL]: [
    {
      to: STATUSES.APPROVED,
      allowedRoles: [ROLES.ADMIN, ROLES.FINANCE_STAFF],
      label: 'Approve',
    },
    {
      to: STATUSES.REJECTED,
      allowedRoles: [ROLES.ADMIN, ROLES.FINANCE_STAFF],
      label: 'Reject',
    },
  ],
  [STATUSES.APPROVED]: [
    {
      to: STATUSES.PROCESSED,
      allowedRoles: [ROLES.ADMIN, ROLES.FINANCE_STAFF],
      label: 'Mark as processed',
    },
  ],
  [STATUSES.REJECTED]: [
    {
      to: STATUSES.SUBMITTED,
      allowedRoles: [ROLES.STUDENT],
      label: 'Re-submit',
    },
  ],
  [STATUSES.PROCESSED]: [],
});

module.exports = { STATUSES, TRANSITIONS };

'use strict';

const fs = require('fs');
const path = require('path');

const db = require('../config/db');
const mailer = require('../config/mailer');
const documentEvents = require('../events/documentEvents');
const auditService = require('./auditService');
const { AUDIT_ACTIONS } = require('../constants/auditActions');

// ── Template rendering ────────────────────────────────────────────────────────

const templateCache = new Map();

function readTemplate(name) {
  if (templateCache.has(name)) return templateCache.get(name);
  const filePath = path.join(__dirname, '../templates/email', `${name}.html`);
  const html = fs.readFileSync(filePath, 'utf8');
  templateCache.set(name, html);
  return html;
}

/**
 * Render an email template by replacing {{key}} tokens.
 * Also handles {{#key}}...{{/key}} conditional blocks (omitted when value is falsy).
 *
 * @param {string} templateName  Filename without .html extension
 * @param {Record<string, string>} vars
 * @returns {string} Rendered HTML
 */
function renderTemplate(templateName, vars) {
  let html = readTemplate(templateName);

  // Conditional blocks: {{#key}}content{{/key}} — removed when vars[key] is falsy
  html = html.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, content) => {
    return vars[key] ? content : '';
  });

  // Simple token replacement
  html = html.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');

  return html;
}

// ── Email sending with retry ──────────────────────────────────────────────────

const MAX_RETRIES = 3;

/**
 * Send an email with up to MAX_RETRIES attempts and exponential backoff.
 * Delays: 1s, 2s, 4s.
 *
 * @param {string} to
 * @param {string} subject
 * @param {string} htmlBody
 * @returns {Promise<void>}
 */
async function sendEmail(to, subject, htmlBody) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await mailer.sendMail({ to, subject, html: htmlBody });
      return;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }
  throw lastError;
}

// ── Status → template/subject mapping ────────────────────────────────────────

function resolveTemplate(toStatus) {
  switch (toStatus) {
    case 'submitted':      return { template: 'documentSubmitted', subject: 'Document Submitted — {{referenceNumber}}' };
    case 'approved':       return { template: 'documentApproved',  subject: 'Your Document Has Been Approved — {{referenceNumber}}' };
    case 'rejected':       return { template: 'documentRejected',  subject: 'Your Document Has Been Rejected — {{referenceNumber}}' };
    default:               return { template: 'statusChanged',     subject: 'Document Status Updated — {{referenceNumber}}' };
  }
}

// ── In-app notification helpers ───────────────────────────────────────────────

function buildInAppBody(toStatus, referenceNumber, title, note) {
  const statusLabels = {
    pending_approval: 'Pending Approval',
    approved: 'Approved',
    rejected: 'Rejected',
    processed: 'Processed',
    submitted: 'Submitted',
  };
  const label = statusLabels[toStatus] ?? toStatus;
  let body = `Your document "${title}" (${referenceNumber}) is now ${label}.`;
  if (note) body += ` Note: ${note}`;
  return body;
}

// ── Event listener ────────────────────────────────────────────────────────────

documentEvents.on('document.status_changed', async ({ documentId, fromStatus, toStatus, actorId, note }) => {
  try {
    // Fetch document + student info
    const doc = await db('documents as d')
      .join('users as u', 'u.id', 'd.student_id')
      .where('d.id', documentId)
      .select('d.id', 'd.reference_number', 'd.title', 'd.updated_at', 'u.id as userId', 'u.email', 'u.email as recipientEmail')
      .first();

    if (!doc) return;

    const { template, subject: subjectTemplate } = resolveTemplate(toStatus);
    const now = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

    const vars = {
      recipientName: doc.email,
      referenceNumber: doc.reference_number,
      title: doc.title,
      fromStatus,
      toStatus,
      note: note || '',
      updatedAt: now,
      submittedAt: now,
    };

    const subject = subjectTemplate.replace('{{referenceNumber}}', doc.reference_number);
    const htmlBody = renderTemplate(template, vars);

    // ── Email notification ────────────────────────────────────────────────────
    const [emailRow] = await db('notifications')
      .insert({
        recipient_id: doc.userId,
        type: 'email',
        subject,
        body: `Status changed from ${fromStatus} to ${toStatus}`,
        status: 'pending',
      })
      .returning('id');

    const emailId = emailRow.id ?? emailRow;

    try {
      await sendEmail(doc.recipientEmail, subject, htmlBody);
      await db('notifications').where({ id: emailId }).update({ status: 'sent', sent_at: db.fn.now() });
    } catch (err) {
      await db('notifications').where({ id: emailId }).update({ status: 'failed' });
      await auditService.log({
        actorId,
        action: AUDIT_ACTIONS.DOCUMENT_STATUS_CHANGED,
        entityType: 'notification',
        entityId: emailId,
        metadata: { error: err.message, documentId, toStatus },
      });
    }

    // ── In-app notification ───────────────────────────────────────────────────
    await db('notifications').insert({
      recipient_id: doc.userId,
      type: 'in_app',
      subject: `Document ${toStatus.replace('_', ' ')}`,
      body: buildInAppBody(toStatus, doc.reference_number, doc.title, note),
      status: 'pending', // 'pending' = unread
    });
  } catch (err) {
    console.error('[notificationService] Unhandled error in status_changed listener:', err.message);
  }
});

module.exports = { renderTemplate, sendEmail };

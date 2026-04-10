'use strict';

// Prevent the event listener from registering during import
jest.mock('../../src/events/documentEvents', () => ({ on: jest.fn(), emit: jest.fn() }));
jest.mock('../../src/config/db', () => { const db = jest.fn(); db.fn = { now: jest.fn(() => new Date()) }; return db; });
jest.mock('../../src/config/mailer', () => ({ sendMail: jest.fn() }));
jest.mock('../../src/services/auditService', () => ({ log: jest.fn() }));

const path = require('path');
const fs = require('fs');
const mailer = require('../../src/config/mailer');
const { renderTemplate, sendEmail } = require('../../src/services/notificationService');

// ── Template rendering ────────────────────────────────────────────────────────

describe('renderTemplate', () => {
  it('replaces {{token}} placeholders', () => {
    const html = renderTemplate('documentSubmitted', {
      recipientName: 'John Doe',
      referenceNumber: 'PGI-2026-000001',
      title: 'Fee Application',
      submittedAt: '02 Apr 2026, 10:00',
    });
    expect(html).toContain('PGI-2026-000001');
    expect(html).toContain('Fee Application');
    expect(html).toContain('John Doe');
  });

  it('renders conditional {{#key}}...{{/key}} block when value is truthy', () => {
    const html = renderTemplate('statusChanged', {
      recipientName: 'Jane',
      referenceNumber: 'PGI-2026-000002',
      title: 'Scholarship',
      fromStatus: 'submitted',
      toStatus: 'pending_approval',
      updatedAt: '02 Apr 2026',
      note: 'Looks good',
    });
    expect(html).toContain('Looks good');
  });

  it('omits conditional {{#key}}...{{/key}} block when value is falsy', () => {
    const html = renderTemplate('statusChanged', {
      recipientName: 'Jane',
      referenceNumber: 'PGI-2026-000002',
      title: 'Scholarship',
      fromStatus: 'submitted',
      toStatus: 'pending_approval',
      updatedAt: '02 Apr 2026',
      note: '',
    });
    expect(html).not.toContain('Note from staff');
  });

  it('renders rejection template with rejection-specific content', () => {
    const html = renderTemplate('documentRejected', {
      recipientName: 'Student',
      referenceNumber: 'PGI-2026-000003',
      title: 'Refund Request',
      updatedAt: '02 Apr 2026',
      note: 'Missing signature',
    });
    expect(html).toContain('Missing signature');
    expect(html).toContain('Re-submit');
  });

  it('renders passwordReset template with reset URL', () => {
    const html = renderTemplate('passwordReset', {
      recipientName: 'Admin',
      resetUrl: 'http://localhost:4200/auth/reset-password?token=abc123',
    });
    expect(html).toContain('abc123');
    expect(html).toContain('1 hour');
  });
});

// ── sendEmail retry logic ─────────────────────────────────────────────────────

describe('sendEmail', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends successfully on first attempt', async () => {
    mailer.sendMail.mockResolvedValue({ messageId: 'ok' });
    await sendEmail('user@example.com', 'Subject', '<p>body</p>');
    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds on second attempt', async () => {
    mailer.sendMail
      .mockRejectedValueOnce(new Error('SMTP error'))
      .mockResolvedValue({ messageId: 'ok' });

    await sendEmail('user@example.com', 'Subject', '<p>body</p>');
    expect(mailer.sendMail).toHaveBeenCalledTimes(2);
  });

  it('retries up to 3 times total then throws', async () => {
    // Make setTimeout fire immediately so we don't wait for real delays
    jest.spyOn(global, 'setTimeout').mockImplementation((fn) => { fn(); return 0; });
    mailer.sendMail.mockRejectedValue(new Error('SMTP down'));

    await expect(sendEmail('user@example.com', 'Subject', '<p>body</p>')).rejects.toThrow('SMTP down');
    expect(mailer.sendMail).toHaveBeenCalledTimes(3);

    jest.restoreAllMocks();
  });

  it('does not call sendMail more than 3 times', async () => {
    jest.spyOn(global, 'setTimeout').mockImplementation((fn) => { fn(); return 0; });
    mailer.sendMail.mockRejectedValue(new Error('fail'));

    await expect(sendEmail('a@b.com', 's', 'b')).rejects.toThrow();
    expect(mailer.sendMail).toHaveBeenCalledTimes(3);

    jest.restoreAllMocks();
  });
});

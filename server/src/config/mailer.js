'use strict';

const nodemailer = require('nodemailer');
const env = require('./env');

let _transporter = null;

async function getTransporter() {
  if (_transporter) return _transporter;

  if (env.NODE_ENV !== 'production' && !env.SMTP_USER) {
    // Dev / test — use Ethereal auto-generated test account
    const testAccount = await nodemailer.createTestAccount();
    _transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    console.log('[mailer] Using Ethereal test account:', testAccount.user);
  } else {
    _transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
  }

  return _transporter;
}

/**
 * Send an email. Compatible with the existing `mailer.sendMail(options)` call pattern.
 *
 * @param {{ to: string, subject: string, html: string }} options
 */
async function sendMail(options) {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({ from: env.EMAIL_FROM, ...options });

  if (env.NODE_ENV !== 'production') {
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) console.log('[mailer] Preview URL:', previewUrl);
  }

  return info;
}

module.exports = { sendMail };

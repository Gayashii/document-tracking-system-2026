'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const mailer = require('../config/mailer');
const env = require('../config/env');
const auditService = require('./auditService');
const { AUDIT_ACTIONS } = require('../constants/auditActions');
const { UnauthorizedError, ConflictError, NotFoundError } = require('../utils/errors');

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_BYTES = 40;
const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function issueAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN },
  );
}

async function issueRefreshToken(userId, trx) {
  const raw = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await (trx || db)('refresh_tokens').insert({ user_id: userId, token_hash: tokenHash, expires_at: expiresAt });

  return raw;
}

// ── Service methods ───────────────────────────────────────────────────────────

async function register({ email, password, role }) {
  const existing = await db('users').where({ email }).first();
  if (existing) {
    throw new ConflictError('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const [user] = await db('users')
    .insert({ email, password_hash: passwordHash, role: role || 'student' })
    .returning(['id', 'email', 'role', 'created_at']);

  const accessToken = issueAccessToken(user);
  const refreshToken = await db.transaction((trx) => issueRefreshToken(user.id, trx));

  return { accessToken, refreshToken, user: { id: user.id, email: user.email, role: user.role } };
}

async function login({ email, password }) {
  const user = await db('users').where({ email, is_active: true }).first();
  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    throw new UnauthorizedError('Invalid email or password');
  }

  await db('users').where({ id: user.id }).update({ last_login_at: new Date() });

  const accessToken = issueAccessToken(user);

  const refreshToken = await db.transaction((trx) => issueRefreshToken(user.id, trx));

  auditService.log({
    actorId: user.id,
    action: AUDIT_ACTIONS.USER_LOGIN,
    entityType: 'user',
    entityId: user.id,
    metadata: { email: user.email },
  }).catch(() => {}); // non-critical — don't block the login response

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, role: user.role },
  };
}

async function refresh(rawRefreshToken) {
  if (!rawRefreshToken) {
    throw new UnauthorizedError('Refresh token missing');
  }

  const tokenHash = hashToken(rawRefreshToken);

  const stored = await db('refresh_tokens')
    .where({ token_hash: tokenHash })
    .whereNull('revoked_at')
    .where('expires_at', '>', new Date())
    .first();

  if (!stored) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const user = await db('users').where({ id: stored.user_id, is_active: true }).first();
  if (!user) {
    throw new UnauthorizedError('User not found or inactive');
  }

  // Rotate: revoke old, issue new
  const newRefreshToken = await db.transaction(async (trx) => {
    await trx('refresh_tokens')
      .where({ id: stored.id })
      .update({ revoked_at: new Date() });

    return issueRefreshToken(user.id, trx);
  });

  const accessToken = issueAccessToken(user);

  return { accessToken, refreshToken: newRefreshToken };
}

async function logout(rawRefreshToken) {
  if (!rawRefreshToken) return;

  const tokenHash = hashToken(rawRefreshToken);

  await db('refresh_tokens')
    .where({ token_hash: tokenHash })
    .whereNull('revoked_at')
    .update({ revoked_at: new Date() });
}

async function forgotPassword(email) {
  const user = await db('users').where({ email, is_active: true }).first();

  // Always respond the same way to avoid user enumeration
  if (!user) return;

  const raw = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await db('password_reset_tokens').insert({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  await mailer.sendMail({
    from: env.EMAIL_FROM,
    to: email,
    subject: 'Reset your password',
    html: `<p>Use this link to reset your password. It expires in 1 hour.</p>
           <p><a href="${env.CORS_ORIGINS.split(',')[0].trim()}/auth/reset-password?token=${raw}">Reset password</a></p>
           <p>If you did not request this, you can safely ignore this email.</p>`,
  });
}

async function resetPassword({ token, newPassword }) {
  const tokenHash = hashToken(token);

  const record = await db('password_reset_tokens')
    .where({ token_hash: tokenHash })
    .whereNull('used_at')
    .where('expires_at', '>', new Date())
    .first();

  if (!record) {
    throw new UnauthorizedError('Invalid or expired reset token');
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  await db.transaction(async (trx) => {
    await trx('users').where({ id: record.user_id }).update({ password_hash: passwordHash });

    await trx('password_reset_tokens')
      .where({ id: record.id })
      .update({ used_at: new Date() });

    // Invalidate all existing sessions
    await trx('refresh_tokens')
      .where({ user_id: record.user_id })
      .whereNull('revoked_at')
      .update({ revoked_at: new Date() });
  });
}

module.exports = { register, login, refresh, logout, forgotPassword, resetPassword };

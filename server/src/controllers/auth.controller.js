'use strict';

const authService = require('../services/authService');
const asyncWrapper = require('../utils/asyncWrapper');

const REFRESH_COOKIE = 'refreshToken';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path: '/api/v1/auth',
};

const register = asyncWrapper(async (req, res) => {
  const { accessToken, refreshToken, user } = await authService.register(req.body);

  res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS);

  res.status(201).json({ success: true, data: { accessToken, user } });
});

const login = asyncWrapper(async (req, res) => {
  const { accessToken, refreshToken, user } = await authService.login(req.body);

  res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS);

  res.json({ success: true, data: { accessToken, user } });
});

const refresh = asyncWrapper(async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE];
  const { accessToken, refreshToken } = await authService.refresh(raw);

  res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS);

  res.json({ success: true, data: { accessToken } });
});

const logout = asyncWrapper(async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE];
  await authService.logout(raw);

  res.clearCookie(REFRESH_COOKIE, { ...COOKIE_OPTIONS, maxAge: 0 });

  res.json({ success: true });
});

const forgotPassword = asyncWrapper(async (req, res) => {
  await authService.forgotPassword(req.body.email);
  // Always 200 — avoid user enumeration
  res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
});

const resetPassword = asyncWrapper(async (req, res) => {
  await authService.resetPassword(req.body);
  res.json({ success: true, message: 'Password updated successfully.' });
});

module.exports = { register, login, refresh, logout, forgotPassword, resetPassword };

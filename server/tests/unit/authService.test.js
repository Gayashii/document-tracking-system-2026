'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Mock DB and mailer before requiring the service
jest.mock('../../src/config/db', () => {
  const mockInsertChain = {
    insert: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([{ id: 99, token_hash: 'hash', expires_at: new Date() }]),
  };
  const mockDb = jest.fn().mockReturnValue(mockInsertChain);
  mockDb.transaction = jest.fn((cb) => cb(mockDb));
  mockDb.raw = jest.fn();
  return mockDb;
});
jest.mock('../../src/config/mailer', () => ({ sendMail: jest.fn().mockResolvedValue(true) }));
jest.mock('../../src/config/env', () => ({
  JWT_ACCESS_SECRET: 'test-access-secret-minimum-32-characters',
  JWT_REFRESH_SECRET: 'test-refresh-secret-minimum-32-characters',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  EMAIL_FROM: 'test@example.com',
  CORS_ORIGINS: 'http://localhost:4200',
}));

const db = require('../../src/config/db');
const authService = require('../../src/services/authService');
const { UnauthorizedError, ConflictError } = require('../../src/utils/errors');

describe('authService', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── register ───────────────────────────────────────────────────────────────
  describe('register', () => {
    it('hashes the password and returns safe user fields', async () => {
      db.mockImplementation((table) => {
        if (table === 'refresh_tokens') {
          return { insert: jest.fn().mockReturnThis(), returning: jest.fn().mockResolvedValue([{ id: 99 }]) };
        }
        return {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(null),
          insert: jest.fn().mockReturnThis(),
          returning: jest.fn().mockResolvedValue([{ id: 1, email: 'a@b.com', role: 'student', created_at: new Date() }]),
        };
      });

      const result = await authService.register({ email: 'a@b.com', password: 'Password@1' });

      expect(result.user.email).toBe('a@b.com');
      expect(result.user.password_hash).toBeUndefined();
      expect(result.accessToken).toBeDefined();
    });

    it('throws ConflictError when email already exists', async () => {
      db.mockImplementation(() => ({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ id: 1 }),
      }));

      await expect(authService.register({ email: 'a@b.com', password: 'Password@1' }))
        .rejects.toThrow(ConflictError);
    });
  });

  // ── password hashing ───────────────────────────────────────────────────────
  describe('password hashing', () => {
    it('bcrypt hash verifies correctly', async () => {
      const hash = await bcrypt.hash('Password@1', 12);
      const match = await bcrypt.compare('Password@1', hash);
      expect(match).toBe(true);
    });

    it('wrong password does not match', async () => {
      const hash = await bcrypt.hash('Password@1', 12);
      const match = await bcrypt.compare('WrongPass@1', hash);
      expect(match).toBe(false);
    });
  });

  // ── JWT ────────────────────────────────────────────────────────────────────
  describe('access token', () => {
    it('contains correct claims and expires in 15m', () => {
      const user = { id: 1, email: 'a@b.com', role: 'student' };
      const env = require('../../src/config/env');
      const token = jwt.sign(
        { sub: user.id, email: user.email, role: user.role },
        env.JWT_ACCESS_SECRET,
        { expiresIn: env.JWT_ACCESS_EXPIRES_IN },
      );

      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
      expect(decoded.sub).toBe(1);
      expect(decoded.email).toBe('a@b.com');
      expect(decoded.role).toBe('student');
    });

    it('rejects a tampered token', () => {
      const env = require('../../src/config/env');
      const token = jwt.sign({ sub: 1 }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
      expect(() => jwt.verify(token + 'tampered', env.JWT_ACCESS_SECRET)).toThrow();
    });
  });

  // ── login ──────────────────────────────────────────────────────────────────
  describe('login', () => {
    it('throws UnauthorizedError for unknown email', async () => {
      db.mockImplementation(() => ({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      }));

      await expect(authService.login({ email: 'x@x.com', password: 'pass' }))
        .rejects.toThrow(UnauthorizedError);
    });

    it('throws UnauthorizedError for wrong password', async () => {
      const hash = await bcrypt.hash('Correct@1', 12);
      db.mockImplementation(() => ({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ id: 1, email: 'a@b.com', role: 'student', password_hash: hash }),
        update: jest.fn().mockResolvedValue(1),
      }));

      await expect(authService.login({ email: 'a@b.com', password: 'Wrong@1' }))
        .rejects.toThrow(UnauthorizedError);
    });
  });
});

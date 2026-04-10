'use strict';

jest.mock('../../src/services/auditService', () => ({ log: jest.fn().mockResolvedValue() }));

const authorize = require('../../src/middleware/authorize');
const { ForbiddenError } = require('../../src/utils/errors');

function makeReq(role) {
  return {
    user: role ? { id: 99, role } : null,
    ip: '127.0.0.1',
    path: '/test',
    method: 'GET',
    headers: { 'user-agent': 'jest' },
  };
}

function makeRes() {
  return {};
}

describe('authorize middleware', () => {
  it('calls next() when role is in allowedRoles', () => {
    const next = jest.fn();
    authorize(['admin'])(makeReq('admin'), makeRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('blocks student from admin-only route', () => {
    const next = jest.fn();
    authorize(['admin'])(makeReq('student'), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    expect(next.mock.calls[0][0].message).toBe('Insufficient role');
  });

  it('blocks finance_staff from admin-only route', () => {
    const next = jest.fn();
    authorize(['admin'])(makeReq('finance_staff'), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it('blocks auditor from admin-only route', () => {
    const next = jest.fn();
    authorize(['admin'])(makeReq('auditor'), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it('allows any listed role', () => {
    const next = jest.fn();
    authorize(['admin', 'finance_staff'])(makeReq('finance_staff'), makeRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('returns ForbiddenError when req.user is missing', () => {
    const next = jest.fn();
    authorize(['admin'])(makeReq(null), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it('logs the denial to audit_logs', async () => {
    const auditService = require('../../src/services/auditService');
    auditService.log.mockClear();
    const next = jest.fn();
    authorize(['admin'])(makeReq('student'), makeRes(), next);
    // allow the fire-and-forget promise to settle
    await Promise.resolve();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ACCESS_DENIED' }),
    );
  });
});

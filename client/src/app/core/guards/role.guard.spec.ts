import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { roleGuard } from './role.guard';
import { AuthService } from '../services/auth.service';
import type { CurrentUser } from '../services/api/auth-api.service';

function makeRoute(roles: string[]): ActivatedRouteSnapshot {
  return { data: { roles } } as unknown as ActivatedRouteSnapshot;
}

function runGuard(route: ActivatedRouteSnapshot) {
  return TestBed.runInInjectionContext(() => roleGuard(route, {} as any));
}

describe('roleGuard', () => {
  let routerSpy: { createUrlTree: ReturnType<typeof vi.fn> };
  let authSpy: { currentUser: Partial<CurrentUser> | null };

  beforeEach(() => {
    routerSpy = { createUrlTree: vi.fn().mockReturnValue('/unauth-tree') };
    authSpy = { currentUser: null };

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: routerSpy },
        { provide: AuthService, useValue: authSpy },
      ],
    });
  });

  it('allows access when user role is in allowed list', () => {
    authSpy.currentUser = { role: 'admin' };
    expect(runGuard(makeRoute(['admin', 'finance_staff']))).toBe(true);
  });

  it('redirects to /unauthorized when role not in list', () => {
    authSpy.currentUser = { role: 'student' };
    const result = runGuard(makeRoute(['admin']));
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/unauthorized']);
    expect(result).toBe('/unauth-tree');
  });

  it('redirects to /unauthorized when no user', () => {
    authSpy.currentUser = null;
    const result = runGuard(makeRoute(['admin']));
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/unauthorized']);
    expect(result).toBe('/unauth-tree');
  });
});

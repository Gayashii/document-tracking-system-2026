import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';
import { RunHelpers, TestScheduler } from 'rxjs/testing';

function runGuard() {
  return TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
}

describe('authGuard', () => {
  let routerSpy: { createUrlTree: ReturnType<typeof vi.fn>; navigate: ReturnType<typeof vi.fn> };
  let authSpy: { isAuthenticated: boolean };

  beforeEach(() => {
    routerSpy = {
      createUrlTree: vi.fn().mockReturnValue('/login-tree'),
      navigate: vi.fn(),
    };
    authSpy = { isAuthenticated: false };

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: routerSpy },
        { provide: AuthService, useValue: authSpy },
      ],
    });
  });

  it('returns true when user is authenticated', () => {
    authSpy.isAuthenticated = true;
    expect(runGuard()).toBe(true);
  });

  it('redirects to /login when user is not authenticated', () => {
    authSpy.isAuthenticated = false;
    const result = runGuard();
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/login']);
    expect(result).toBe('/login-tree');
  });
});

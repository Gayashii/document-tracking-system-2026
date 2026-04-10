import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { AuthApiService } from './api/auth-api.service';
import type { LoginRequest, RegisterRequest, AuthResponse, CurrentUser } from './api/auth-api.service';

const STORAGE_KEY = 'currentUser';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private readonly authApi = inject(AuthApiService);

  private readonly _currentUser$ = new BehaviorSubject<CurrentUser | null>(
    this.loadStoredUser(),
  );
  private readonly _isLoading$ = new BehaviorSubject<boolean>(false);

  readonly currentUser$ = this._currentUser$.asObservable();
  readonly isLoading$ = this._isLoading$.asObservable();

  get currentUser(): CurrentUser | null {
    return this._currentUser$.value;
  }

  get isAuthenticated(): boolean {
    return this._currentUser$.value !== null;
  }

  get accessToken(): string | null {
    return this._currentUser$.value?.accessToken ?? null;
  }

  login(email: string, password: string): Observable<AuthResponse> {
    this._isLoading$.next(true);
    return this.authApi.login({ email, password }).pipe(
      tap((res) => this.setSession(res)),
      catchError((err) => {
        this._isLoading$.next(false);
        return throwError(() => err);
      }),
      tap(() => this._isLoading$.next(false)),
    );
  }

  register(payload: RegisterRequest): Observable<AuthResponse> {
    this._isLoading$.next(true);
    return this.authApi.register(payload).pipe(
      tap((res) => this.setSession(res)),
      catchError((err) => {
        this._isLoading$.next(false);
        return throwError(() => err);
      }),
      tap(() => this._isLoading$.next(false)),
    );
  }

  refreshToken(): Observable<AuthResponse> {
    return this.authApi.refresh().pipe(
      tap((res) => this.setSession(res)),
      catchError((err) => {
        this.clearSession();
        return throwError(() => err);
      }),
    );
  }

  logout(): void {
    this.authApi.logout().subscribe({ complete: () => this.clearSession() });
    this.clearSession();
  }

  forgotPassword(email: string): Observable<void> {
    return this.authApi.forgotPassword(email);
  }

  resetPassword(token: string, password: string): Observable<void> {
    return this.authApi.resetPassword(token, password);
  }

  private setSession(res: AuthResponse): void {
    const user: CurrentUser = {
      id: res.user.id,
      email: res.user.email,
      fullName: (res.user as any).fullName ?? (res.user as any).full_name ?? res.user.email,
      role: res.user.role,
      accessToken: res.accessToken,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    this._currentUser$.next(user);
  }

  private clearSession(): void {
    sessionStorage.removeItem(STORAGE_KEY);
    this._currentUser$.next(null);
    this.router.navigate(['/login']);
  }

  private loadStoredUser(): CurrentUser | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CurrentUser) : null;
    } catch {
      return null;
    }
  }
}

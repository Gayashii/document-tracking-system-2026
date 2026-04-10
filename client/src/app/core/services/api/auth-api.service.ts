import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export type UserRole = 'admin' | 'finance_staff' | 'student' | 'auditor';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  fullName: string;
  email: string;
  password: string;
  studentId?: string;
}

export interface CurrentUser {
  id: number;
  email: string;
  fullName: string;
  role: UserRole;
  accessToken: string;
}

export interface AuthResponse {
  accessToken: string;
  user: {
    id: number;
    email: string;
    fullName: string;
    role: UserRole;
  };
}

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/auth`;

  login(payload: LoginRequest): Observable<AuthResponse> {
    return this.http
      .post<{ success: boolean; data: AuthResponse }>(`${this.base}/login`, payload)
      .pipe(map((res) => res.data));
  }

  register(payload: RegisterRequest): Observable<AuthResponse> {
    return this.http
      .post<{ success: boolean; data: AuthResponse }>(`${this.base}/register`, payload)
      .pipe(map((res) => res.data));
  }

  refresh(): Observable<AuthResponse> {
    return this.http
      .post<{ success: boolean; data: AuthResponse }>(`${this.base}/refresh`, {}, { withCredentials: true })
      .pipe(map((res) => res.data));
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.base}/logout`, {}, { withCredentials: true });
  }

  forgotPassword(email: string): Observable<void> {
    return this.http.post<void>(`${this.base}/forgot-password`, { email });
  }

  resetPassword(token: string, password: string): Observable<void> {
    return this.http.post<void>(`${this.base}/reset-password`, { token, password });
  }
}

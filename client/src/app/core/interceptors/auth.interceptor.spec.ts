import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

const mockAuthService = {
  accessToken: 'test-token',
  refreshToken: vi.fn(),
};

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthService.accessToken = 'test-token';

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: mockAuthService },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('attaches Authorization header when token is present', () => {
    http.get('/api/v1/documents').subscribe();
    const req = httpMock.expectOne('/api/v1/documents');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
    req.flush({});
  });

  it('does not attach Authorization header to /auth/refresh requests', () => {
    http.post('/api/v1/auth/refresh', {}).subscribe();
    const req = httpMock.expectOne('/api/v1/auth/refresh');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('calls refreshToken on 401 and retries the original request', fakeAsync(() => {
    const newToken = 'refreshed-token';
    mockAuthService.refreshToken.mockReturnValue(
      of({ accessToken: newToken, user: { id: 1, email: 'a@b.com', fullName: 'Test', role: 'admin' } }),
    );
    mockAuthService.accessToken = 'expired-token';

    let responseData: any;
    http.get('/api/v1/documents').subscribe((data) => (responseData = data));

    // Respond with 401
    const firstReq = httpMock.expectOne('/api/v1/documents');
    firstReq.flush({}, { status: 401, statusText: 'Unauthorized' });
    tick();

    // After refresh, interceptor should retry
    const retryReq = httpMock.expectOne('/api/v1/documents');
    expect(retryReq.request.headers.get('Authorization')).toBe(`Bearer ${newToken}`);
    retryReq.flush({ data: [] });
    tick();

    expect(responseData).toEqual({ data: [] });
  }));
});

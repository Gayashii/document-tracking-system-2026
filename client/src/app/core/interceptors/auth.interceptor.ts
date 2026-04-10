import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse, HttpEvent } from '@angular/common/http';
import { inject } from '@angular/core';
import { throwError, BehaviorSubject, Observable } from 'rxjs';
import { catchError, filter, take, switchMap } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

let isRefreshing = false;
const refreshSubject$ = new BehaviorSubject<string | null>(null);

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  const auth = inject(AuthService);

  // Skip token attachment for refresh/logout endpoints
  if (req.url.includes('/auth/refresh') || req.url.includes('/auth/logout')) {
    return next(req);
  }

  const token = auth.accessToken;
  const authReq = token ? addToken(req, token) : req;

  return next(authReq).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        return handle401(req, next, auth);
      }
      return throwError(() => err);
    }),
  );
};

function addToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

function handle401(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  auth: AuthService,
): Observable<HttpEvent<unknown>> {
  if (isRefreshing) {
    return refreshSubject$.pipe(
      filter((token) => token !== null),
      take(1),
      switchMap((token) => next(addToken(req, token!))),
    );
  }

  isRefreshing = true;
  refreshSubject$.next(null);

  return auth.refreshToken().pipe(
    switchMap((res) => {
      isRefreshing = false;
      refreshSubject$.next(res.accessToken);
      return next(addToken(req, res.accessToken));
    }),
    catchError((err) => {
      isRefreshing = false;
      return throwError(() => err);
    }),
  );
}

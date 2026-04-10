import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export interface AppNotification {
  id: number;
  subject: string;
  body: string;
  status: 'pending' | 'sent' | 'failed';
  sent_at: string | null;
  created_at: string;
}

export interface NotificationListResponse {
  data: AppNotification[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

@Injectable({ providedIn: 'root' })
export class NotificationApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/notifications`;

  getMine(page = 1, limit = 20): Observable<NotificationListResponse> {
    return this.http.get<{ success: boolean } & NotificationListResponse>(
      `${this.base}/mine`, { params: { page, limit } }
    ).pipe(map(({ data, pagination }) => ({ data, pagination })));
  }

  getUnreadCount(): Observable<number> {
    return this.http
      .get<{ success: boolean; data: { count: number } }>(`${this.base}/unread-count`)
      .pipe(map((res) => res.data.count));
  }

  markRead(id: number): Observable<void> {
    return this.http.patch<void>(`${this.base}/${id}/read`, {});
  }

  markAllRead(): Observable<void> {
    return this.http.patch<void>(`${this.base}/read-all`, {});
  }
}

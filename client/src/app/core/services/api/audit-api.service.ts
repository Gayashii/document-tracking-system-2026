import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export interface AuditEntry {
  id: number;
  action: string;
  entityType: string;
  entityId: number | null;
  metadata: Record<string, any> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  actorId: number | null;
  actorEmail: string | null;
  actorRole: string | null;
}

export interface AuditListResponse {
  data: AuditEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AuditFilters {
  actor_email?: string;
  action?: string;
  entity_type?: string;
  entity_id?: number;
  actor_id?: number;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

function mapEntry(r: any): AuditEntry {
  return {
    id:          r.id,
    action:      r.action,
    entityType:  r.entity_type,
    entityId:    r.entity_id ?? null,
    metadata:    typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata ?? null),
    ipAddress:   r.ip_address ?? null,
    userAgent:   r.user_agent ?? null,
    createdAt:   r.created_at,
    actorId:     r.actor_id ?? null,
    actorEmail:  r.actor_email ?? null,
    actorRole:   r.actor_role ?? null,
  };
}

@Injectable({ providedIn: 'root' })
export class AuditApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/audit`;

  list(filters: AuditFilters = {}): Observable<AuditListResponse> {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v != null && v !== '') p = p.set(k, String(v));
    }
    return this.http
      .get<{ success: boolean; data: any[]; pagination: any }>(this.base, { params: p })
      .pipe(map((r) => ({ data: r.data.map(mapEntry), pagination: r.pagination })));
  }

  entityHistory(entityType: string, entityId: number): Observable<AuditEntry[]> {
    return this.http
      .get<{ success: boolean; data: any[] }>(`${this.base}/entity/${entityType}/${entityId}`)
      .pipe(map((r) => r.data.map(mapEntry)));
  }

  download(filters: AuditFilters = {}): Observable<Blob> {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v != null && v !== '') p = p.set(k, String(v));
    }
    return this.http.get(`${this.base}/export`, { params: p, responseType: 'blob' });
  }
}

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export interface PendingRow {
  id: number;
  reference_number: string;
  title: string;
  document_type: string;
  department: string;
  student_email: string;
  status: string;
  submitted_at: string;
  days_pending: number;
}

export interface HistoryRow {
  document_id: number;
  reference_number: string;
  title: string;
  document_type: string;
  department: string;
  student_email: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  changed_at: string;
  changed_by_email: string;
  changed_by_role: string;
}

export interface StatisticsData {
  total: number;
  by_status:     { status: string; count: number }[];
  by_type:       { document_type: string; count: number }[];
  by_department: { department: string; count: number }[];
  by_year:       { academic_year: string; count: number }[];
  trend:         { month: string; count: number }[];
}

export interface OverdueRow {
  id: number;
  reference_number: string;
  title: string;
  document_type: string;
  department: string;
  student_email: string;
  submitted_at: string;
  days_pending: number;
  overdue_threshold_days: number;
}

export interface ReportFilters {
  department_id?: number;
  from?: string;
  to?: string;
}

@Injectable({ providedIn: 'root' })
export class ReportApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/reports`;

  getPending(filters: ReportFilters = {}): Observable<{ data: PendingRow[]; total: number }> {
    return this.http.get<{ success: boolean; data: PendingRow[]; total: number }>(
      `${this.base}/pending`, { params: this.buildParams(filters) },
    ).pipe(map((r) => ({ data: r.data, total: r.total })));
  }

  getHistory(filters: ReportFilters = {}): Observable<{ data: HistoryRow[]; total: number }> {
    return this.http.get<{ success: boolean; data: HistoryRow[]; total: number }>(
      `${this.base}/history`, { params: this.buildParams(filters) },
    ).pipe(map((r) => ({ data: r.data, total: r.total })));
  }

  getStatistics(filters: ReportFilters = {}): Observable<StatisticsData> {
    return this.http.get<{ success: boolean; data: StatisticsData }>(
      `${this.base}/statistics`, { params: this.buildParams(filters) },
    ).pipe(map((r) => r.data));
  }

  getOverdue(filters: ReportFilters = {}): Observable<{ data: OverdueRow[]; total: number }> {
    return this.http.get<{ success: boolean; data: OverdueRow[]; total: number }>(
      `${this.base}/overdue`, { params: this.buildParams(filters) },
    ).pipe(map((r) => ({ data: r.data, total: r.total })));
  }

  download(report: 'pending' | 'history' | 'overdue', format: 'csv' | 'xlsx' | 'pdf', filters: ReportFilters = {}): Observable<Blob> {
    const params = this.buildParams({ ...filters, report, format });
    return this.http.get(`${this.base}/export`, { params, responseType: 'blob' });
  }

  private buildParams(filters: Record<string, any>): HttpParams {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v != null && v !== '') p = p.set(k, String(v));
    }
    return p;
  }
}

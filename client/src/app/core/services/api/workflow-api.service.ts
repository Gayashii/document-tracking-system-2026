import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export interface WorkflowStep {
  id: number;
  step_order: number;
  phase_label: string;
  is_final: boolean;
  assigned_user_id: number | null;
  assigned_user_email: string | null;
}

export interface Workflow {
  id: number;
  name: string;
  document_type_id: number | null;
  document_type_name: string | null;
  step_count?: number;
  steps: WorkflowStep[];
  created_at: string;
}

export interface PhaseLogEntry {
  id: number;
  action: 'assigned' | 'advanced' | 'returned' | 'resolved';
  note: string | null;
  created_at: string;
  phase_label: string | null;
  step_order: number | null;
  actor_email: string | null;
}

export interface PhaseInfo {
  document_id: number;
  status: string;
  assigned_to: { id: number; email: string; role: string } | null;
  has_workflow: boolean;
  workflow_id: number | null;
  total_steps: number;
  current_step: WorkflowStep | null;
  steps: WorkflowStep[];
  phase_log: PhaseLogEntry[];
}

@Injectable({ providedIn: 'root' })
export class WorkflowApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/workflows`;
  private readonly docBase = `${environment.apiBaseUrl}/documents`;

  // ── Workflow templates (admin) ──────────────────────────────────────────────

  list(): Observable<Workflow[]> {
    return this.http.get<any>(this.base).pipe(map((r) => r.data));
  }

  getOne(id: number): Observable<Workflow> {
    return this.http.get<any>(`${this.base}/${id}`).pipe(map((r) => r.data));
  }

  create(payload: { name: string; document_type_id: number | null }): Observable<Workflow> {
    return this.http.post<any>(this.base, payload).pipe(map((r) => r.data));
  }

  update(id: number, payload: { name?: string; document_type_id?: number | null }): Observable<Workflow> {
    return this.http.patch<any>(`${this.base}/${id}`, payload).pipe(map((r) => r.data));
  }

  replaceSteps(id: number, steps: { phase_label: string; assigned_user_id: number }[]): Observable<Workflow> {
    return this.http.put<any>(`${this.base}/${id}/steps`, { steps }).pipe(map((r) => r.data));
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  // ── Document phase actions ──────────────────────────────────────────────────

  getPhaseInfo(docId: number): Observable<PhaseInfo> {
    return this.http.get<any>(`${this.docBase}/${docId}/phase`).pipe(map((r) => r.data));
  }

  assign(docId: number, payload: { assigned_to_id?: number; note?: string }): Observable<void> {
    return this.http.post<any>(`${this.docBase}/${docId}/assign`, payload).pipe(map(() => void 0));
  }

  advance(docId: number, note?: string): Observable<void> {
    return this.http.post<any>(`${this.docBase}/${docId}/phase/advance`, { note }).pipe(map(() => void 0));
  }

  returnPhase(docId: number, note?: string): Observable<void> {
    return this.http.post<any>(`${this.docBase}/${docId}/phase/return`, { note }).pipe(map(() => void 0));
  }

  resolve(docId: number, decision: 'approved' | 'rejected', note?: string): Observable<void> {
    return this.http.post<any>(`${this.docBase}/${docId}/phase/resolve`, { decision, note }).pipe(map(() => void 0));
  }
}

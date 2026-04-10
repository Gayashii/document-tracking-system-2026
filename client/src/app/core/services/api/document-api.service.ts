import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export type DocumentStatus =
  | 'submitted'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'processed';

export interface DocumentMeta {
  id: number;
  referenceNumber: string;
  title: string;
  documentType: string;
  status: DocumentStatus;
  studentId: number | null;
  academicYear: string | null;
  financialAmount: string | null;
  submittedAt: string;
  updatedAt: string;
  uploadedBy: number;
  fileName: string;
  fileSize: number;
  mimeType: string;
  barcodeNumber: string | null;
  assignedToId: number | null;
  currentWorkflowStepId: number | null;
}

export interface DocumentListResponse {
  data: DocumentMeta[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface StatusHistoryEntry {
  id: number;
  fromStatus: DocumentStatus | null;
  toStatus: DocumentStatus;
  note: string | null;
  createdAt: string;
  changedById: number;
  changedByEmail: string;
  changedByRole: string;
}

export interface DocumentVersion {
  id: number;
  versionNumber: number;
  filePath: string;
  changeNote: string | null;
  createdAt: string;
  uploadedById: number;
  uploadedByEmail: string;
}

export interface DocumentListParams {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  documentType?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface SearchParams {
  q?: string;
  type?: number;
  status?: string;       // single value or comma-separated list
  from?: string;         // ISO date
  to?: string;           // ISO date
  student_id?: number;
  amount_min?: number;
  amount_max?: number;
  department_id?: number;
  page?: number;
  limit?: number;
}

export interface DocumentType {
  id: number;
  name: string;
}

// Maps snake_case server row → camelCase DocumentMeta
function mapDoc(row: any): DocumentMeta {
  return {
    id: row.id,
    referenceNumber: row.reference_number ?? row.referenceNumber,
    title: row.title,
    documentType: row.document_type_name ?? row.documentType ?? row.document_type_id ?? '',
    status: row.status,
    studentId: row.student_id ?? row.studentId ?? null,
    academicYear: row.academic_year ?? row.academicYear ?? null,
    financialAmount: row.financial_amount ?? row.financialAmount ?? null,
    submittedAt: row.submitted_at ?? row.submittedAt ?? row.created_at ?? '',
    updatedAt: row.updated_at ?? row.updatedAt ?? '',
    uploadedBy: row.student_id ?? row.uploadedBy ?? 0,
    fileName: row.file_path ? row.file_path.split('/').pop() : (row.fileName ?? ''),
    fileSize: row.file_size ?? row.fileSize ?? 0,
    mimeType: row.mime_type ?? row.mimeType ?? '',
    barcodeNumber: row.barcode_number ?? row.barcodeNumber ?? null,
    assignedToId: row.assigned_to_id ?? row.assignedToId ?? null,
    currentWorkflowStepId: row.current_workflow_step_id ?? row.currentWorkflowStepId ?? null,
  };
}

@Injectable({ providedIn: 'root' })
export class DocumentApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/documents`;

  list(params: DocumentListParams = {}): Observable<DocumentListResponse> {
    let httpParams = new HttpParams();
    if (params.page) httpParams = httpParams.set('page', params.page);
    if (params.limit) httpParams = httpParams.set('limit', params.limit);
    if (params.status) httpParams = httpParams.set('status', params.status);
    if (params.search) httpParams = httpParams.set('search', params.search);
    if (params.documentType) httpParams = httpParams.set('documentType', params.documentType);
    if (params.dateFrom) httpParams = httpParams.set('dateFrom', params.dateFrom);
    if (params.dateTo) httpParams = httpParams.set('dateTo', params.dateTo);

    return this.http
      .get<{ success: boolean; data: any[]; pagination: any }>(this.base, { params: httpParams })
      .pipe(
        map((res) => ({
          data: res.data.map(mapDoc),
          pagination: res.pagination,
        })),
      );
  }

  getById(id: number): Observable<DocumentMeta> {
    return this.http
      .get<{ success: boolean; data: any }>(`${this.base}/${id}`)
      .pipe(map((res) => mapDoc(res.data)));
  }

  getDownloadUrl(id: number): Observable<{ url: string }> {
    // Download is a direct file stream — return the URL for window.open
    return new Observable((observer) => {
      observer.next({ url: `${this.base}/${id}/file` });
      observer.complete();
    });
  }

  updateStatus(id: number, status: DocumentStatus, note?: string): Observable<DocumentMeta> {
    return this.http
      .patch<{ success: boolean; data: any }>(`${this.base}/${id}/status`, { status, note })
      .pipe(map((res) => mapDoc(res.data)));
  }

  setBarcode(id: number, barcodeNumber: string): Observable<{ barcode_number: string }> {
    return this.http
      .patch<{ success: boolean; data: any }>(`${this.base}/${id}/barcode`, { barcode_number: barcodeNumber })
      .pipe(map((res) => res.data));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  listVersions(id: number): Observable<DocumentVersion[]> {
    return this.http
      .get<{ success: boolean; data: any[] }>(`${this.base}/${id}/versions`)
      .pipe(
        map((res) =>
          res.data.map((v) => ({
            id: v.id,
            versionNumber: v.version_number,
            filePath: v.file_path,
            changeNote: v.change_note ?? null,
            createdAt: v.created_at,
            uploadedById: v.uploaded_by_id,
            uploadedByEmail: v.uploaded_by_email,
          })),
        ),
      );
  }

  createVersion(id: number, file: File, changeNote?: string): Observable<DocumentMeta> {
    const form = new FormData();
    form.append('file', file);
    if (changeNote) form.append('change_note', changeNote);
    return this.http
      .post<{ success: boolean; data: any }>(`${this.base}/${id}/versions`, form)
      .pipe(map((res) => mapDoc(res.data)));
  }

  getHistory(id: number): Observable<StatusHistoryEntry[]> {
    return this.http
      .get<{ success: boolean; data: any[] }>(`${this.base}/${id}/history`)
      .pipe(
        map((res) =>
          res.data.map((h) => ({
            id: h.id,
            fromStatus: h.from_status ?? null,
            toStatus: h.to_status,
            note: h.note ?? null,
            createdAt: h.created_at,
            changedById: h.changed_by_id,
            changedByEmail: h.changed_by_email,
            changedByRole: h.changed_by_role,
          })),
        ),
      );
  }

  getVersionDownloadUrl(docId: number, versionId: number): string {
    return `${this.base}/${docId}/versions/${versionId}/download`;
  }

  search(params: SearchParams = {}): Observable<DocumentListResponse> {
    let httpParams = new HttpParams();
    if (params.q)            httpParams = httpParams.set('q',             params.q);
    if (params.type)         httpParams = httpParams.set('type',          params.type);
    if (params.status)       httpParams = httpParams.set('status',        params.status);
    if (params.from)         httpParams = httpParams.set('from',          params.from);
    if (params.to)           httpParams = httpParams.set('to',            params.to);
    if (params.student_id)   httpParams = httpParams.set('student_id',    params.student_id);
    if (params.amount_min != null) httpParams = httpParams.set('amount_min', params.amount_min);
    if (params.amount_max != null) httpParams = httpParams.set('amount_max', params.amount_max);
    if (params.department_id) httpParams = httpParams.set('department_id', params.department_id);
    if (params.page)         httpParams = httpParams.set('page',          params.page);
    if (params.limit)        httpParams = httpParams.set('limit',         params.limit);

    return this.http
      .get<{ success: boolean; data: any[]; pagination: any }>(
        `${this.base}/search`,
        { params: httpParams },
      )
      .pipe(
        map((res) => ({
          data: res.data.map(mapDoc),
          pagination: res.pagination,
        })),
      );
  }

  scanBarcode(code: string): Observable<{ id: number; referenceNumber: string; title: string; status: string; documentType: string }> {
    return this.http
      .get<{ success: boolean; data: any }>(`${environment.apiBaseUrl}/scan`, { params: { code } })
      .pipe(map((res) => ({
        id:              res.data.id,
        referenceNumber: res.data.reference_number,
        title:           res.data.title,
        status:          res.data.status,
        documentType:    res.data.document_type,
      })));
  }

  getDocumentTypes(): Observable<DocumentType[]> {
    return this.http
      .get<{ success: boolean; data: any[] }>(`${environment.apiBaseUrl}/lookups/document-types`)
      .pipe(map((res) => res.data.map((t) => ({ id: t.id, name: t.name }))));
  }
}

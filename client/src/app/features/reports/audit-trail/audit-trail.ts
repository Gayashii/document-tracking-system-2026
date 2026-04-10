import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuditApiService, AuditEntry, AuditFilters } from '../../../core/services/api/audit-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { SpinnerComponent } from '../../../shared/components/spinner/spinner';
import { PaginationComponent } from '../../../shared/components/pagination/pagination';

// All known action values for the filter dropdown
const ALL_ACTIONS = [
  'DOCUMENT_UPLOADED', 'DOCUMENT_VIEWED', 'DOCUMENT_DOWNLOADED',
  'DOCUMENT_STATUS_CHANGED', 'DOCUMENT_DELETED', 'DOCUMENT_BARCODE_SET',
  'DOCUMENT_VERSION_CREATED', 'DOCUMENT_UPDATED', 'DOCUMENT_ASSIGNED',
  'USER_LOGIN', 'USER_LOGOUT', 'USER_LOGIN_FAILED',
  'USER_PASSWORD_RESET_REQUESTED', 'USER_PASSWORD_RESET',
  'USER_CREATED', 'USER_UPDATED', 'USER_DEACTIVATED', 'USER_REACTIVATED',
  'REPORT_EXPORTED', 'ADMIN_USER_CREATED', 'ADMIN_USER_DEACTIVATED',
  'ACCESS_DENIED',
  'DEPARTMENT_CREATED', 'DEPARTMENT_UPDATED',
  'DOCUMENT_TYPE_CREATED', 'DOCUMENT_TYPE_UPDATED', 'DOCUMENT_TYPE_DEACTIVATED',
];

@Component({
  selector: 'app-audit-trail',
  imports: [RouterLink, FormsModule, SpinnerComponent, PaginationComponent],
  templateUrl: './audit-trail.html',
})
export class AuditTrail implements OnInit {
  private readonly auditApi = inject(AuditApiService);
  private readonly route    = inject(ActivatedRoute);
  private readonly toast    = inject(ToastService);

  readonly loading    = signal(true);
  readonly entries    = signal<AuditEntry[]>([]);
  readonly page       = signal(1);
  readonly totalPages = signal(1);
  readonly total      = signal(0);

  // Expandable rows — set of entry IDs whose metadata is visible
  readonly expandedIds = signal<Set<number>>(new Set());

  // Filters
  actorEmail  = '';
  actionFilter = '';
  entityType  = '';
  dateFrom    = '';
  dateTo      = '';

  readonly allActions = ALL_ACTIONS;

  // Pre-filter context from URL (e.g. coming from document detail)
  private preEntityType = '';
  private preEntityId: number | null = null;

  ngOnInit(): void {
    // Support ?entity_type=document&entity_id=42 from document detail link
    const qp = this.route.snapshot.queryParams;
    if (qp['entity_type']) { this.entityType = qp['entity_type']; this.preEntityType = qp['entity_type']; }
    if (qp['entity_id'])   { this.preEntityId = parseInt(qp['entity_id'], 10); }
    if (qp['actor_email']) this.actorEmail  = qp['actor_email'];
    if (qp['action'])      this.actionFilter = qp['action'];
    if (qp['from'])        this.dateFrom    = qp['from'];
    if (qp['to'])          this.dateTo      = qp['to'];
    this.load(1);
  }

  private buildFilters(): AuditFilters {
    const f: AuditFilters = {};
    if (this.actorEmail.trim())  f.actor_email  = this.actorEmail.trim();
    if (this.actionFilter)       f.action       = this.actionFilter;
    if (this.entityType.trim())  f.entity_type  = this.entityType.trim();
    if (this.preEntityId)        f.entity_id    = this.preEntityId;
    if (this.dateFrom)           f.from         = this.dateFrom;
    if (this.dateTo)             f.to           = this.dateTo;
    return f;
  }

  load(page = 1): void {
    this.loading.set(true);
    this.auditApi.list({ ...this.buildFilters(), page, limit: 25 }).subscribe({
      next: (res) => {
        this.entries.set(res.data);
        this.page.set(res.pagination.page);
        this.totalPages.set(res.pagination.totalPages);
        this.total.set(res.pagination.total);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('Failed to load audit log.');
        this.loading.set(false);
      },
    });
  }

  applyFilters(): void {
    this.preEntityId = null; // clear pre-filter when user changes filters manually
    this.load(1);
  }

  clearFilters(): void {
    this.actorEmail   = '';
    this.actionFilter = '';
    this.entityType   = '';
    this.dateFrom     = '';
    this.dateTo       = '';
    this.preEntityId  = null;
    this.load(1);
  }

  onPageChange(p: number): void {
    this.load(p);
  }

  toggleExpand(id: number): void {
    this.expandedIds.update((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  isExpanded(id: number): boolean {
    return this.expandedIds().has(id);
  }

  readonly exporting = signal(false);

  exportCsv(): void {
    this.exporting.set(true);
    this.auditApi.download(this.buildFilters()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'audit-trail.csv';
        a.click();
        URL.revokeObjectURL(url);
        this.exporting.set(false);
      },
      error: () => {
        this.toast.error('Export failed.');
        this.exporting.set(false);
      },
    });
  }

  formatJson(obj: any): string {
    if (!obj) return '—';
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  }

  formatDate(d: string): string {
    return new Date(d).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  get preFilterLabel(): string {
    if (this.preEntityId && this.preEntityType) {
      return `Showing audit history for ${this.preEntityType} #${this.preEntityId}`;
    }
    return '';
  }
}

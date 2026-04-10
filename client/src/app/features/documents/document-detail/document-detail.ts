import { Component, inject, signal, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import {
  DocumentApiService,
  DocumentMeta,
  DocumentStatus,
  StatusHistoryEntry,
} from '../../../core/services/api/document-api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { DocumentActionsService } from '../../../core/services/document-actions.service';
import { WorkflowApiService, PhaseInfo } from '../../../core/services/api/workflow-api.service';
import { environment } from '../../../../environments/environment';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge';
import { SpinnerComponent } from '../../../shared/components/spinner/spinner';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton';
import { StatusTimelineComponent } from '../../../shared/components/status-timeline/status-timeline';

type WorkflowAction = 'pending_approval' | 'approved' | 'rejected' | 'processed';

@Component({
  selector: 'app-document-detail',
  imports: [RouterLink, FormsModule, StatusBadgeComponent, SpinnerComponent, SkeletonComponent, StatusTimelineComponent],
  templateUrl: './document-detail.html',
})
export class DocumentDetail implements OnInit {
  private readonly route       = inject(ActivatedRoute);
  private readonly docApi      = inject(DocumentApiService);
  private readonly docActions  = inject(DocumentActionsService);
  private readonly workflowApi = inject(WorkflowApiService);
  private readonly http        = inject(HttpClient);
  readonly auth                = inject(AuthService);
  private readonly toast       = inject(ToastService);

  readonly loading = signal(true);
  readonly downloading = signal(false);
  readonly document = signal<DocumentMeta | null>(null);
  readonly history = signal<StatusHistoryEntry[]>([]);

  readonly barcodeEditing = signal(false);
  readonly barcodeSaving = signal(false);
  barcodeInput = '';

  // Workflow action state
  readonly actionPending = signal(false);
  readonly confirmAction = signal<WorkflowAction | null>(null);
  actionNote = '';

  // Re-submission state
  readonly resubmitting = signal(false);
  resubmitChangeNote = '';
  @ViewChild('resubmitFileInput') resubmitFileInput!: ElementRef<HTMLInputElement>;

  // Phase / assignment state
  readonly phaseInfo      = signal<PhaseInfo | null>(null);
  readonly phaseLoading   = signal(false);
  readonly phaseActing    = signal(false);
  phaseNote               = '';
  resolveDecision: 'approved' | 'rejected' | null = null;
  resolveNote             = '';
  assignTargetId: number | null = null;
  staffUsers: { id: number; email: string }[] = [];
  showAssignPanel         = false;

  // Confirmation guards for destructive phase actions
  confirmingAdvance       = false;
  confirmingReturn        = false;

  get isOwner(): boolean {
    const user = this.auth.currentUser;
    return user?.role === 'student' && this.document()?.studentId === user.id;
  }

  get canResubmit(): boolean {
    return this.isOwner && this.document()?.status === 'rejected';
  }

  get isStaffOrAdmin(): boolean {
    const role = this.auth.currentUser?.role;
    return role === 'finance_staff' || role === 'admin';
  }

  get isAuditor(): boolean {
    return this.auth.currentUser?.role === 'auditor';
  }

  /** Actions available to staff/admin based on the current status.
   *  Hides approve/reject for pending_approval documents with an active workflow
   *  — those must go through the phase panel instead. */
  get availableActions(): WorkflowAction[] {
    const status = this.document()?.status;
    if (!this.isStaffOrAdmin || !status) return [];
    // Documents with an active workflow must be resolved through the phase panel
    if (status === 'pending_approval' && this.phaseInfo()?.has_workflow) return [];
    const map: Partial<Record<DocumentStatus, WorkflowAction[]>> = {
      submitted: ['pending_approval', 'rejected'],
      pending_approval: ['approved', 'rejected'],
      approved: ['processed'],
    };
    return map[status] ?? [];
  }

  actionLabel(action: WorkflowAction): string {
    const labels: Record<WorkflowAction, string> = {
      pending_approval: 'Mark as Pending Review',
      approved: 'Approve',
      rejected: 'Reject',
      processed: 'Mark as Processed',
    };
    return labels[action];
  }

  actionVariant(action: WorkflowAction): string {
    if (action === 'rejected') return 'btn-outline-danger';
    if (action === 'approved' || action === 'processed') return 'btn-success';
    return 'btn-outline-primary';
  }

  get isAdmin(): boolean { return this.auth.currentUser?.role === 'admin'; }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.docApi.getById(id).subscribe({
      next: (doc) => {
        this.document.set(doc);
        this.loading.set(false);
        this.loadHistory(id);
        this.loadPhaseInfo(id);
      },
      error: () => {
        this.toast.error('Document not found.');
        this.loading.set(false);
      },
    });

    if (this.isAdmin) {
      this.http.get<any>(`${environment.apiBaseUrl}/users`, { params: { role: 'finance_staff', status: 'active', limit: '100' } }).subscribe({
        next: (r) => { this.staffUsers = r.data; },
      });
    }
  }

  loadPhaseInfo(id: number): void {
    this.phaseLoading.set(true);
    this.workflowApi.getPhaseInfo(id).subscribe({
      next: (info) => { this.phaseInfo.set(info); this.phaseLoading.set(false); },
      error: () => { this.phaseLoading.set(false); },
    });
  }

  selfAssign(): void {
    const doc = this.document();
    if (!doc) return;
    this.phaseActing.set(true);
    this.workflowApi.assign(doc.id, {}).subscribe({
      next: () => {
        this.toast.success('Document assigned to you.');
        this.phaseActing.set(false);
        this.showAssignPanel = false;
        this.loadPhaseInfo(doc.id);
        this.docApi.getById(doc.id).subscribe({ next: (d) => this.document.set(d) });
      },
      error: (err) => { this.phaseActing.set(false); this.toast.error(err?.error?.error?.message ?? 'Failed.'); },
    });
  }

  assignToStaff(): void {
    const doc = this.document();
    if (!doc || !this.assignTargetId) return;
    this.phaseActing.set(true);
    this.workflowApi.assign(doc.id, { assigned_to_id: this.assignTargetId }).subscribe({
      next: () => {
        this.toast.success('Document assigned.');
        this.phaseActing.set(false);
        this.showAssignPanel = false;
        this.assignTargetId = null;
        this.loadPhaseInfo(doc.id);
        this.docApi.getById(doc.id).subscribe({ next: (d) => this.document.set(d) });
      },
      error: (err) => { this.phaseActing.set(false); this.toast.error(err?.error?.error?.message ?? 'Failed.'); },
    });
  }

  confirmAdvance(): void  { this.confirmingAdvance = true; this.confirmingReturn = false; }
  confirmReturn(): void   { this.confirmingReturn  = true; this.confirmingAdvance = false; }
  cancelPhaseConfirm(): void { this.confirmingAdvance = false; this.confirmingReturn = false; }

  advancePhase(): void {
    const doc = this.document();
    if (!doc) return;
    this.confirmingAdvance = false;
    this.phaseActing.set(true);
    this.workflowApi.advance(doc.id, this.phaseNote || undefined).subscribe({
      next: () => {
        this.toast.success('Moved to next phase.');
        this.phaseNote = '';
        this.loadPhaseInfo(doc.id);
        this.docApi.getById(doc.id).subscribe({
          next: (d) => { this.document.set(d); this.phaseActing.set(false); },
          error: () => this.phaseActing.set(false),
        });
      },
      error: (err) => { this.phaseActing.set(false); this.toast.error(err?.error?.error?.message ?? 'Failed.'); },
    });
  }

  returnPhase(): void {
    const doc = this.document();
    if (!doc) return;
    this.confirmingReturn = false;
    this.phaseActing.set(true);
    this.workflowApi.returnPhase(doc.id, this.phaseNote || undefined).subscribe({
      next: () => {
        this.toast.success('Returned to previous phase.');
        this.phaseNote = '';
        this.loadPhaseInfo(doc.id);
        this.docApi.getById(doc.id).subscribe({
          next: (d) => { this.document.set(d); this.phaseActing.set(false); },
          error: () => this.phaseActing.set(false),
        });
      },
      error: (err) => { this.phaseActing.set(false); this.toast.error(err?.error?.error?.message ?? 'Failed.'); },
    });
  }

  openResolve(decision: 'approved' | 'rejected'): void {
    this.resolveDecision = decision;
    this.resolveNote = '';
  }

  submitResolve(): void {
    const doc = this.document();
    if (!doc || !this.resolveDecision) return;
    if (this.resolveDecision === 'rejected' && !this.resolveNote.trim()) {
      this.toast.error('A note is required when rejecting.');
      return;
    }
    this.phaseActing.set(true);
    this.workflowApi.resolve(doc.id, this.resolveDecision, this.resolveNote || undefined).subscribe({
      next: () => {
        this.toast.success(`Document ${this.resolveDecision}.`);
        this.resolveDecision = null;
        this.phaseActing.set(false);
        this.loadPhaseInfo(doc.id);
        this.docApi.getById(doc.id).subscribe({ next: (d) => { this.document.set(d); this.loadHistory(d.id); } });
      },
      error: (err) => { this.phaseActing.set(false); this.toast.error(err?.error?.error?.message ?? 'Failed.'); },
    });
  }

  /** Admin can advance/return phases, but only the actual assignee can resolve. */
  isCurrentAssignee(): boolean {
    const info = this.phaseInfo();
    if (!info) return false;
    if (this.isAdmin) return true;
    return info.assigned_to?.id === this.auth.currentUser?.id;
  }

  /** Strict check — only the actual assignee (no admin bypass) can resolve. */
  isActualAssignee(): boolean {
    const info = this.phaseInfo();
    if (!info) return false;
    return info.assigned_to?.id === this.auth.currentUser?.id;
  }

  private loadHistory(id: number): void {
    this.docApi.getHistory(id).subscribe({
      next: (h) => this.history.set(h),
      error: () => { /* non-critical — timeline just shows without metadata */ },
    });
  }

  openConfirm(action: WorkflowAction): void {
    this.actionNote = '';
    this.confirmAction.set(action);
  }

  cancelConfirm(): void {
    this.confirmAction.set(null);
  }

  submitAction(): void {
    const action = this.confirmAction();
    const doc = this.document();
    if (!action || !doc) return;
    if (action === 'rejected' && !this.actionNote.trim()) {
      this.toast.error('A note is required when rejecting a document.');
      return;
    }

    const previousStatus = doc.status;
    const note = this.actionNote;
    this.confirmAction.set(null);
    this.actionPending.set(true);
    this.actionNote = '';

    this.docActions.transitionStatus(doc.id, action as DocumentStatus, note || undefined, {
      onOptimisticUpdate: () =>
        this.document.update((d) => d ? { ...d, status: action as DocumentStatus } : d),
      onSuccess: (updated) => {
        this.document.set(updated);
        this.actionPending.set(false);
        this.loadHistory(doc.id);
      },
      onRevert: () => {
        this.document.update((d) => d ? { ...d, status: previousStatus } : d);
        this.actionPending.set(false);
      },
    });
  }

  download(): void {
    const doc = this.document();
    if (!doc) return;
    this.downloading.set(true);

    this.http
      .get(`${environment.apiBaseUrl}/documents/${doc.id}/download`, { responseType: 'blob' })
      .subscribe({
        next: (blob) => {
          this.downloading.set(false);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = doc.fileName || `document-${doc.id}`;
          a.click();
          URL.revokeObjectURL(url);
        },
        error: () => {
          this.downloading.set(false);
          this.toast.error('Failed to download file.');
        },
      });
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  startBarcodeEdit(): void {
    this.barcodeInput = this.document()?.barcodeNumber ?? '';
    this.barcodeEditing.set(true);
  }

  cancelBarcodeEdit(): void {
    this.barcodeEditing.set(false);
  }

  saveBarcode(): void {
    const doc = this.document();
    if (!doc || !this.barcodeInput.trim()) return;
    this.barcodeSaving.set(true);
    this.docApi.setBarcode(doc.id, this.barcodeInput.trim()).subscribe({
      next: (result) => {
        this.document.update((d) => d ? { ...d, barcodeNumber: result.barcode_number } : d);
        this.barcodeEditing.set(false);
        this.barcodeSaving.set(false);
        this.toast.success('Barcode number saved.');
      },
      error: (err) => {
        this.barcodeSaving.set(false);
        const msg = err?.error?.error?.message ?? 'Failed to save barcode number.';
        this.toast.error(msg);
      },
    });
  }

  resubmit(): void {
    const file = this.resubmitFileInput?.nativeElement?.files?.[0];
    const doc = this.document();
    if (!file || !doc) return;
    this.resubmitting.set(true);
    this.docApi.createVersion(doc.id, file, this.resubmitChangeNote || undefined).subscribe({
      next: (updated) => {
        this.document.set(updated);
        this.resubmitting.set(false);
        this.resubmitChangeNote = '';
        if (this.resubmitFileInput?.nativeElement) {
          this.resubmitFileInput.nativeElement.value = '';
        }
        this.loadHistory(doc.id);
        this.toast.success('Document re-submitted successfully.');
      },
      error: (err) => {
        this.resubmitting.set(false);
        const msg = err?.error?.error?.message ?? 'Failed to re-submit document.';
        this.toast.error(msg);
      },
    });
  }
}

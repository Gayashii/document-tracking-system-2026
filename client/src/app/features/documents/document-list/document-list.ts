import { Component, inject, signal, OnInit, OnDestroy, ElementRef, viewChild } from '@angular/core';
import { BrowserMultiFormatReader } from '@zxing/library';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject, takeUntil } from 'rxjs';
import {
  DocumentApiService,
  DocumentMeta,
  DocumentStatus,
  DocumentType,
  SearchParams,
} from '../../../core/services/api/document-api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { DocumentActionsService } from '../../../core/services/document-actions.service';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge';
import { PaginationComponent } from '../../../shared/components/pagination/pagination';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state';

interface QuickAction {
  docId: number;
  action: 'approved' | 'rejected';
  note: string;
  saving: boolean;
}

interface ActiveFilter {
  key: string;
  label: string;
}

const ALL_STATUSES = [
  { value: 'submitted',        label: 'Submitted' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved',         label: 'Approved' },
  { value: 'rejected',         label: 'Rejected' },
  { value: 'processed',        label: 'Processed' },
];

@Component({
  selector: 'app-document-list',
  imports: [RouterLink, FormsModule, ReactiveFormsModule, StatusBadgeComponent, PaginationComponent, SkeletonComponent, EmptyStateComponent],
  templateUrl: './document-list.html',
})
export class DocumentList implements OnInit, OnDestroy {
  private readonly docApi     = inject(DocumentApiService);
  private readonly docActions = inject(DocumentActionsService);
  readonly auth               = inject(AuthService);
  private readonly toast      = inject(ToastService);
  private readonly router     = inject(Router);
  private readonly route      = inject(ActivatedRoute);
  private readonly destroy$   = new Subject<void>();

  readonly loading   = signal(true);
  readonly documents = signal<DocumentMeta[]>([]);
  readonly page      = signal(1);
  readonly totalPages = signal(1);
  readonly total     = signal(0);

  readonly documentTypes = signal<DocumentType[]>([]);

  // Search control (debounced)
  readonly searchControl = new FormControl('');

  // Filter state
  selectedStatuses: Record<string, boolean> = {};
  typeFilter    = '';
  dateFrom      = '';
  dateTo        = '';
  amountMin     = '';
  amountMax     = '';
  sortBy        = 'newest';

  // Barcode scan
  barcodeInput = '';
  readonly barcodeScanning     = signal(false);
  readonly barcodeImageDecoding = signal(false);
  private readonly barcodeFileInput = viewChild<ElementRef<HTMLInputElement>>('barcodeFileInput');

  // Inline quick-action confirm per row
  readonly quickAction = signal<QuickAction | null>(null);

  readonly allStatuses = ALL_STATUSES;

  get isStudent(): boolean { return this.auth.currentUser?.role === 'student'; }
  get isStaffOrAdmin(): boolean {
    const r = this.auth.currentUser?.role;
    return r === 'finance_staff' || r === 'admin';
  }

  get activeFilters(): ActiveFilter[] {
    const filters: ActiveFilter[] = [];
    const q = this.searchControl.value?.trim();
    if (q) filters.push({ key: 'q', label: `"${q}"` });
    const statuses = this.activeStatusList;
    if (statuses.length) filters.push({ key: 'status', label: `Status: ${statuses.join(', ')}` });
    if (this.typeFilter) {
      const dt = this.documentTypes().find((t) => String(t.id) === this.typeFilter);
      filters.push({ key: 'type', label: `Type: ${dt?.name ?? this.typeFilter}` });
    }
    if (this.dateFrom) filters.push({ key: 'from', label: `From: ${this.dateFrom}` });
    if (this.dateTo)   filters.push({ key: 'to',   label: `To: ${this.dateTo}` });
    if (this.amountMin !== '') filters.push({ key: 'amount_min', label: `Min: ${this.amountMin}` });
    if (this.amountMax !== '') filters.push({ key: 'amount_max', label: `Max: ${this.amountMax}` });
    return filters;
  }

  get hasActiveFilters(): boolean { return this.activeFilters.length > 0; }

  private get activeStatusList(): string[] {
    return ALL_STATUSES.filter((s) => this.selectedStatuses[s.value]).map((s) => s.label);
  }

  private get activeStatusValues(): string {
    return ALL_STATUSES
      .filter((s) => this.selectedStatuses[s.value])
      .map((s) => s.value)
      .join(',');
  }

  ngOnInit(): void {
    // Load document types for filter dropdown
    this.docApi.getDocumentTypes().subscribe({
      next: (types) => this.documentTypes.set(types),
      error: () => { /* non-critical */ },
    });

    // Read initial filter state from URL query params
    const qp = this.route.snapshot.queryParams;
    if (qp['q'])          this.searchControl.setValue(qp['q'], { emitEvent: false });
    if (qp['status'])     qp['status'].split(',').forEach((s: string) => { this.selectedStatuses[s] = true; });
    if (qp['type'])       this.typeFilter  = qp['type'];
    if (qp['from'])       this.dateFrom    = qp['from'];
    if (qp['to'])         this.dateTo      = qp['to'];
    if (qp['amount_min']) this.amountMin   = qp['amount_min'];
    if (qp['amount_max']) this.amountMax   = qp['amount_max'];
    if (qp['sort'])       this.sortBy      = qp['sort'];

    // Finance staff: default to pending_approval queue when no URL filter set
    if (this.auth.currentUser?.role === 'finance_staff' && !qp['status']) {
      this.selectedStatuses['pending_approval'] = true;
      this.sortBy = 'oldest';
    }

    // Debounced keyword search
    this.searchControl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(() => this.applyFilters());

    this.loadDocuments(parseInt(qp['page'] ?? '1', 10));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadDocuments(page = 1): void {
    this.loading.set(true);

    const params: SearchParams = { page, limit: 15 };
    const q = this.searchControl.value?.trim();
    if (q)                  params.q          = q;
    const statusVal = this.activeStatusValues;
    if (statusVal)          params.status     = statusVal;
    if (this.typeFilter)    params.type       = parseInt(this.typeFilter, 10);
    if (this.dateFrom)      params.from       = this.dateFrom;
    if (this.dateTo)        params.to         = this.dateTo;
    if (this.amountMin !== '') params.amount_min = parseFloat(this.amountMin);
    if (this.amountMax !== '') params.amount_max = parseFloat(this.amountMax);

    this.docApi.search(params).subscribe({
      next: (res) => {
        let data = res.data;
        // Client-side sort (server always returns newest-first)
        if (this.sortBy === 'oldest') {
          data = [...data].sort(
            (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
          );
        }
        this.documents.set(data);
        this.page.set(res.pagination.page);
        this.totalPages.set(res.pagination.totalPages);
        this.total.set(res.pagination.total);
        this.loading.set(false);
        this.syncUrl(page);
      },
      error: () => {
        this.toast.error('Failed to load documents.');
        this.loading.set(false);
      },
    });
  }

  applyFilters(): void {
    this.loadDocuments(1);
  }

  onPageChange(page: number): void {
    this.loadDocuments(page);
  }

  removeFilter(key: string): void {
    switch (key) {
      case 'q':          this.searchControl.setValue('', { emitEvent: false }); break;
      case 'status':     this.selectedStatuses = {}; break;
      case 'type':       this.typeFilter  = ''; break;
      case 'from':       this.dateFrom    = ''; break;
      case 'to':         this.dateTo      = ''; break;
      case 'amount_min': this.amountMin   = ''; break;
      case 'amount_max': this.amountMax   = ''; break;
    }
    this.applyFilters();
  }

  clearAllFilters(): void {
    this.searchControl.setValue('', { emitEvent: false });
    this.selectedStatuses = {};
    this.typeFilter  = '';
    this.dateFrom    = '';
    this.dateTo      = '';
    this.amountMin   = '';
    this.amountMax   = '';
    this.applyFilters();
  }

  private syncUrl(page: number): void {
    const queryParams: Record<string, string | null> = {
      q:          this.searchControl.value?.trim() || null,
      status:     this.activeStatusValues         || null,
      type:       this.typeFilter                 || null,
      from:       this.dateFrom                   || null,
      to:         this.dateTo                     || null,
      amount_min: this.amountMin                  || null,
      amount_max: this.amountMax                  || null,
      sort:       this.sortBy !== 'newest' ? this.sortBy : null,
      page:       page > 1 ? String(page) : null,
    };
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  // ─── Barcode scan ────────────────────────────────────────────────────────

  onBarcodeScan(): void {
    const code = this.barcodeInput.trim();
    if (!code) return;
    this.barcodeScanning.set(true);
    this.docApi.scanBarcode(code).subscribe({
      next: (result) => {
        this.barcodeInput = '';
        this.barcodeScanning.set(false);
        this.router.navigate(['/app/documents', result.id]);
      },
      error: (err) => {
        this.barcodeScanning.set(false);
        const status = err?.status;
        if (status === 404) {
          this.toast.error(`No document found for barcode "${code}".`);
        } else {
          this.toast.error('Barcode lookup failed. Please try again.');
        }
      },
    });
  }

  onBarcodeKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.onBarcodeScan();
  }

  openBarcodeImagePicker(): void {
    this.barcodeFileInput()?.nativeElement.click();
  }

  async onBarcodeImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    input.value = ''; // reset so the same file can be re-selected
    this.barcodeImageDecoding.set(true);

    try {
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeFromImageUrl(url);
      this.barcodeInput = result.getText();
      this.onBarcodeScan();
    } catch {
      this.toast.error('Could not read a barcode from this image. Try a clearer photo.');
    } finally {
      URL.revokeObjectURL(url);
      this.barcodeImageDecoding.set(false);
    }
  }

  // ─── Quick actions (staff / admin) ───────────────────────────────────────

  openQuickAction(doc: DocumentMeta, action: 'approved' | 'rejected'): void {
    this.quickAction.set({ docId: doc.id, action, note: '', saving: false });
  }

  cancelQuickAction(): void {
    this.quickAction.set(null);
  }

  submitQuickAction(): void {
    const qa = this.quickAction();
    if (!qa) return;
    if (qa.action === 'rejected' && !qa.note.trim()) {
      this.toast.error('A rejection note is required.');
      return;
    }

    const previousDocs = this.documents();
    this.quickAction.set(null);

    const filteringByPending =
      this.selectedStatuses['pending_approval'] &&
      Object.keys(this.selectedStatuses).filter((k) => this.selectedStatuses[k]).length === 1;

    this.docActions.transitionStatus(
      qa.docId,
      qa.action as DocumentStatus,
      qa.note || undefined,
      {
        onOptimisticUpdate: () => {
          if (filteringByPending) {
            this.documents.update((docs) => docs.filter((d) => d.id !== qa.docId));
          } else {
            this.documents.update((docs) =>
              docs.map((d) => d.id === qa.docId ? { ...d, status: qa.action as DocumentStatus } : d),
            );
          }
        },
        onSuccess: () => { /* toast shown by service */ },
        onRevert: () => this.documents.set(previousDocs),
      },
    );
  }

  // ─── Formatting ──────────────────────────────────────────────────────────

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

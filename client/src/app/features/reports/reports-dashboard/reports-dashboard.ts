import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ReportApiService, PendingRow, OverdueRow, StatisticsData, ReportFilters } from '../../../core/services/api/report-api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { SpinnerComponent } from '../../../shared/components/spinner/spinner';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge';

type ActiveTab = 'pending' | 'overdue' | 'statistics';

@Component({
  selector: 'app-reports-dashboard',
  imports: [FormsModule, SpinnerComponent, StatusBadgeComponent],
  templateUrl: './reports-dashboard.html',
})
export class ReportsDashboard implements OnInit {
  private readonly reportApi = inject(ReportApiService);
  readonly auth              = inject(AuthService);
  private readonly toast     = inject(ToastService);

  readonly activeTab    = signal<ActiveTab>('pending');
  readonly loading      = signal(false);

  // Summary card data
  readonly pendingCount   = signal(0);
  readonly overdueCount   = signal(0);
  readonly approvedToday  = signal(0);
  readonly rejectedWeek   = signal(0);

  // Report data
  readonly pendingRows  = signal<PendingRow[]>([]);
  readonly overdueRows  = signal<OverdueRow[]>([]);
  readonly stats        = signal<StatisticsData | null>(null);

  // Filters
  departmentFilter = '';
  dateFrom = '';
  dateTo   = '';

  get isAdmin(): boolean { return this.auth.currentUser?.role === 'admin'; }
  get isAuditor(): boolean { return this.auth.currentUser?.role === 'auditor'; }
  get canExport(): boolean { return this.isAdmin || this.isAuditor || this.auth.currentUser?.role === 'finance_staff'; }

  // SVG bar chart — documents by status
  readonly chartBars = computed(() => {
    const s = this.stats();
    if (!s || !s.by_status.length) return [];
    const max = Math.max(...s.by_status.map((x) => x.count), 1);
    const BAR_H = 120;
    return s.by_status.map((item) => ({
      label: item.status.replace(/_/g, ' '),
      count: item.count,
      heightPct: Math.round((item.count / max) * BAR_H),
    }));
  });

  ngOnInit(): void {
    this.loadSummaryCards();
    this.loadTab('pending');
  }

  private getFilters(): ReportFilters {
    const f: ReportFilters = {};
    if (this.departmentFilter) f.department_id = parseInt(this.departmentFilter, 10);
    if (this.dateFrom) f.from = this.dateFrom;
    if (this.dateTo)   f.to   = this.dateTo;
    return f;
  }

  private loadSummaryCards(): void {
    // Pending count
    this.reportApi.getPending({}).subscribe({
      next: (r) => this.pendingCount.set(r.total),
      error: () => {},
    });
    // Overdue count
    this.reportApi.getOverdue({}).subscribe({
      next: (r) => this.overdueCount.set(r.total),
      error: () => {},
    });
    // Statistics for approved today / rejected this week
    this.reportApi.getStatistics({}).subscribe({
      next: (s) => {
        this.stats.set(s);
        const approved = s.by_status.find((x) => x.status === 'approved');
        const rejected = s.by_status.find((x) => x.status === 'rejected');
        // Use total approved / rejected as approximation (no per-day granularity here)
        this.approvedToday.set(approved?.count ?? 0);
        this.rejectedWeek.set(rejected?.count ?? 0);
      },
      error: () => {},
    });
  }

  setTab(tab: ActiveTab): void {
    this.activeTab.set(tab);
    this.loadTab(tab);
  }

  applyFilters(): void {
    this.loadTab(this.activeTab());
    this.loadSummaryCards();
  }

  private loadTab(tab: ActiveTab): void {
    this.loading.set(true);
    const filters = this.getFilters();

    if (tab === 'pending') {
      this.reportApi.getPending(filters).subscribe({
        next: (r) => { this.pendingRows.set(r.data); this.loading.set(false); },
        error: () => { this.toast.error('Failed to load pending report.'); this.loading.set(false); },
      });
    } else if (tab === 'overdue') {
      this.reportApi.getOverdue(filters).subscribe({
        next: (r) => { this.overdueRows.set(r.data); this.loading.set(false); },
        error: () => { this.toast.error('Failed to load overdue report.'); this.loading.set(false); },
      });
    } else {
      this.reportApi.getStatistics(filters).subscribe({
        next: (s) => { this.stats.set(s); this.loading.set(false); },
        error: () => { this.toast.error('Failed to load statistics.'); this.loading.set(false); },
      });
    }
  }

  readonly exporting = signal(false);

  export(format: 'csv' | 'xlsx' | 'pdf'): void {
    const report = this.activeTab() === 'statistics' ? 'pending' : this.activeTab() as 'pending' | 'history' | 'overdue';
    this.exporting.set(true);
    this.reportApi.download(report, format, this.getFilters()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${report}-report.${format}`;
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

  formatDate(dateStr: string): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}

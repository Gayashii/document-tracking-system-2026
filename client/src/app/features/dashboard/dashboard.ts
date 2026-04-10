import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DocumentApiService, DocumentMeta, DocumentStatus } from '../../core/services/api/document-api.service';
import { AuthService } from '../../core/services/auth.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge';
import { SpinnerComponent } from '../../shared/components/spinner/spinner';

interface StatusCount {
  status: DocumentStatus;
  count: number;
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, StatusBadgeComponent, SpinnerComponent],
  templateUrl: './dashboard.html',
})
export class Dashboard implements OnInit {
  readonly auth = inject(AuthService);
  private readonly docApi = inject(DocumentApiService);

  readonly loading = signal(true);
  readonly totalDocs = signal(0);
  readonly recentDocs = signal<DocumentMeta[]>([]);
  readonly statusCounts = signal<StatusCount[]>([]);

  get user() { return this.auth.currentUser; }
  get isAdmin() { return this.user?.role === 'admin'; }
  get isFinanceStaff() { return this.user?.role === 'finance_staff'; }
  get isStudent() { return this.user?.role === 'student'; }

  readonly rejectedDocs = computed(() =>
    this.recentDocs().filter((d) => d.status === 'rejected'),
  );

  readonly pendingApprovalDocs = computed(() => {
    const userId = this.auth.currentUser?.id;
    return this.recentDocs().filter(
      (d) => d.status === 'pending_approval' && d.assignedToId === userId,
    );
  });

  ngOnInit(): void {
    this.loadStats();
  }

  private loadStats(): void {
    this.docApi.list({ page: 1, limit: 20 }).subscribe({
      next: (res) => {
        this.totalDocs.set(res.pagination.total);
        this.recentDocs.set(res.data);

        const counts: Partial<Record<DocumentStatus, number>> = {};
        for (const doc of res.data) {
          counts[doc.status] = (counts[doc.status] ?? 0) + 1;
        }
        this.statusCounts.set(
          (Object.entries(counts) as [DocumentStatus, number][]).map(
            ([status, count]) => ({ status, count }),
          ),
        );
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
}

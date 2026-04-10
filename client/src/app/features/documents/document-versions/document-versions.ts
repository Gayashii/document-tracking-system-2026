import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DocumentApiService, DocumentVersion } from '../../../core/services/api/document-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { SpinnerComponent } from '../../../shared/components/spinner/spinner';

@Component({
  selector: 'app-document-versions',
  imports: [RouterLink, SpinnerComponent],
  templateUrl: './document-versions.html',
})
export class DocumentVersions implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly docApi = inject(DocumentApiService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly versions = signal<DocumentVersion[]>([]);
  documentId!: number;

  ngOnInit(): void {
    this.documentId = Number(this.route.snapshot.paramMap.get('id'));
    this.docApi.listVersions(this.documentId).subscribe({
      next: (v) => {
        this.versions.set(v);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('Failed to load version history.');
        this.loading.set(false);
      },
    });
  }

  downloadUrl(versionId: number): string {
    return this.docApi.getVersionDownloadUrl(this.documentId, versionId);
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
}

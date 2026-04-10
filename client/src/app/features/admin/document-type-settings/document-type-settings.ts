import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../core/services/toast.service';
import { SpinnerComponent } from '../../../shared/components/spinner/spinner';
import { environment } from '../../../../environments/environment';

interface DocumentType {
  id: number;
  name: string;
  description: string | null;
  requires_approval: boolean;
  is_active: boolean;
}

@Component({
  selector: 'app-document-type-settings',
  imports: [FormsModule, SpinnerComponent],
  templateUrl: './document-type-settings.html',
})
export class DocumentTypeSettings implements OnInit {
  private readonly http  = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly base  = `${environment.apiBaseUrl}/document-types`;

  readonly loading = signal(true);
  readonly saving  = signal(false);
  readonly types   = signal<DocumentType[]>([]);

  // Create
  showCreate = false;
  newName = ''; newDesc = ''; newRequiresApproval = false;

  // Inline edit
  editingId: number | null = null;
  editName = ''; editDesc = ''; editRequiresApproval = false; editIsActive = true;

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.http.get<any>(this.base).subscribe({
      next: (r) => { this.types.set(r.data); this.loading.set(false); },
      error: () => { this.toast.error('Failed to load document types.'); this.loading.set(false); },
    });
  }

  submitCreate(): void {
    if (!this.newName) return;
    this.saving.set(true);
    this.http.post<any>(this.base, {
      name: this.newName,
      description: this.newDesc || null,
      requires_approval: this.newRequiresApproval,
    }).subscribe({
      next: (r) => {
        this.types.update((t) => [...t, r.data]);
        this.showCreate = false; this.newName = ''; this.newDesc = ''; this.newRequiresApproval = false;
        this.saving.set(false); this.toast.success('Document type created.');
      },
      error: (err) => { this.saving.set(false); this.toast.error(err?.error?.error?.message ?? 'Failed.'); },
    });
  }

  startEdit(t: DocumentType): void {
    this.editingId = t.id;
    this.editName = t.name;
    this.editDesc = t.description ?? '';
    this.editRequiresApproval = t.requires_approval;
    this.editIsActive = t.is_active;
  }

  saveEdit(t: DocumentType): void {
    this.saving.set(true);
    this.http.patch<any>(`${this.base}/${t.id}`, {
      name: this.editName,
      description: this.editDesc || null,
      requires_approval: this.editRequiresApproval,
      is_active: this.editIsActive,
    }).subscribe({
      next: (r) => {
        this.types.update((ts) => ts.map((x) => x.id === t.id ? r.data : x));
        this.editingId = null; this.saving.set(false); this.toast.success('Document type updated.');
      },
      error: (err) => { this.saving.set(false); this.toast.error(err?.error?.error?.message ?? 'Failed.'); },
    });
  }

  remove(t: DocumentType): void {
    if (!confirm(`Delete document type "${t.name}"? This cannot be undone.`)) return;
    this.http.delete(`${this.base}/${t.id}`).subscribe({
      next: () => { this.types.update((ts) => ts.filter((x) => x.id !== t.id)); this.toast.success('Document type deleted.'); },
      error: (err) => this.toast.error(err?.error?.error?.message ?? 'Cannot delete.'),
    });
  }
}

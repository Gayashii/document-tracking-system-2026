import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../core/services/toast.service';
import { SpinnerComponent } from '../../../shared/components/spinner/spinner';
import { environment } from '../../../../environments/environment';

interface Department { id: number; name: string; code: string; description: string | null; }

@Component({
  selector: 'app-department-settings',
  imports: [FormsModule, SpinnerComponent],
  templateUrl: './department-settings.html',
})
export class DepartmentSettings implements OnInit {
  private readonly http  = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly base  = `${environment.apiBaseUrl}/departments`;

  readonly loading = signal(true);
  readonly saving  = signal(false);
  readonly depts   = signal<Department[]>([]);

  // Create
  showCreate = false;
  newName = ''; newCode = ''; newDesc = '';

  // Inline edit
  editingId: number | null = null;
  editName = ''; editCode = ''; editDesc = '';

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.http.get<any>(this.base).subscribe({
      next: (r) => { this.depts.set(r.data); this.loading.set(false); },
      error: () => { this.toast.error('Failed to load departments.'); this.loading.set(false); },
    });
  }

  submitCreate(): void {
    if (!this.newName || !this.newCode) return;
    this.saving.set(true);
    this.http.post<any>(this.base, { name: this.newName, code: this.newCode, description: this.newDesc }).subscribe({
      next: (r) => {
        this.depts.update((d) => [...d, r.data]);
        this.showCreate = false; this.newName = ''; this.newCode = ''; this.newDesc = '';
        this.saving.set(false); this.toast.success('Department created.');
      },
      error: (err) => { this.saving.set(false); this.toast.error(err?.error?.error?.message ?? 'Failed.'); },
    });
  }

  startEdit(d: Department): void {
    this.editingId = d.id; this.editName = d.name; this.editCode = d.code; this.editDesc = d.description ?? '';
  }

  saveEdit(d: Department): void {
    this.saving.set(true);
    this.http.patch<any>(`${this.base}/${d.id}`, { name: this.editName, code: this.editCode, description: this.editDesc }).subscribe({
      next: (r) => {
        this.depts.update((ds) => ds.map((x) => x.id === d.id ? r.data : x));
        this.editingId = null; this.saving.set(false); this.toast.success('Department updated.');
      },
      error: (err) => { this.saving.set(false); this.toast.error(err?.error?.error?.message ?? 'Failed.'); },
    });
  }

  remove(d: Department): void {
    if (!confirm(`Delete department "${d.name}"? This cannot be undone.`)) return;
    this.http.delete(`${this.base}/${d.id}`).subscribe({
      next: () => { this.depts.update((ds) => ds.filter((x) => x.id !== d.id)); this.toast.success('Department deleted.'); },
      error: (err) => this.toast.error(err?.error?.error?.message ?? 'Cannot delete.'),
    });
  }
}

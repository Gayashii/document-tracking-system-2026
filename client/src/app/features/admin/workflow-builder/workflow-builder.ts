import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../core/services/toast.service';
import { SpinnerComponent } from '../../../shared/components/spinner/spinner';
import { WorkflowApiService, Workflow, WorkflowStep } from '../../../core/services/api/workflow-api.service';
import { environment } from '../../../../environments/environment';

interface DocumentType { id: number; name: string; }
interface StaffUser    { id: number; email: string; }

interface DraftStep {
  phase_label: string;
  assigned_user_id: number | null;
}

@Component({
  selector: 'app-workflow-builder',
  imports: [FormsModule, SpinnerComponent],
  templateUrl: './workflow-builder.html',
})
export class WorkflowBuilder implements OnInit {
  private readonly api   = inject(WorkflowApiService);
  private readonly http  = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly loading  = signal(true);
  readonly saving   = signal(false);
  readonly workflows = signal<Workflow[]>([]);

  documentTypes = signal<DocumentType[]>([]);
  staffUsers    = signal<StaffUser[]>([]);

  // Create form
  showCreate    = false;
  newName       = '';
  newTypeId: number | null = null;

  // Editing a workflow's steps
  editingId: number | null = null;
  draftSteps: DraftStep[]  = [];

  ngOnInit(): void {
    this.load();
    this.http.get<any>(`${environment.apiBaseUrl}/lookups/document-types`).subscribe({
      next: (r) => this.documentTypes.set(r.data),
    });
    // Load active finance_staff for step assignment
    this.http.get<any>(`${environment.apiBaseUrl}/users`, { params: { role: 'finance_staff', status: 'active', limit: '100' } }).subscribe({
      next: (r) => this.staffUsers.set(r.data),
    });
  }

  load(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (data) => { this.workflows.set(data); this.loading.set(false); },
      error: () => { this.toast.error('Failed to load workflows.'); this.loading.set(false); },
    });
  }

  submitCreate(): void {
    if (!this.newName.trim()) return;
    this.saving.set(true);
    this.api.create({ name: this.newName.trim(), document_type_id: this.newTypeId }).subscribe({
      next: (w) => {
        this.workflows.update((ws) => [...ws, { ...w, step_count: 0 }]);
        this.showCreate = false; this.newName = ''; this.newTypeId = null;
        this.saving.set(false);
        this.toast.success('Workflow created.');
        this.startEditSteps(w);
      },
      error: (err) => { this.saving.set(false); this.toast.error(err?.error?.error?.message ?? 'Failed.'); },
    });
  }

  startEditSteps(w: Workflow): void {
    this.editingId = w.id;
    // Pre-fill from existing steps if any
    if (w.steps?.length) {
      this.draftSteps = w.steps.map((s) => ({
        phase_label:      s.phase_label,
        assigned_user_id: s.assigned_user_id,
      }));
    } else {
      this.draftSteps = [{ phase_label: '', assigned_user_id: null }];
    }
  }

  loadAndEdit(w: Workflow): void {
    this.api.getOne(w.id).subscribe({
      next: (full) => this.startEditSteps(full),
      error: () => this.toast.error('Failed to load workflow.'),
    });
  }

  cancelEdit(): void { this.editingId = null; this.draftSteps = []; }

  addStep(): void {
    this.draftSteps = [...this.draftSteps, { phase_label: '', assigned_user_id: null }];
  }

  removeStep(i: number): void {
    this.draftSteps = this.draftSteps.filter((_, idx) => idx !== i);
  }

  moveUp(i: number): void {
    if (i === 0) return;
    const s = [...this.draftSteps];
    [s[i - 1], s[i]] = [s[i], s[i - 1]];
    this.draftSteps = s;
  }

  moveDown(i: number): void {
    if (i === this.draftSteps.length - 1) return;
    const s = [...this.draftSteps];
    [s[i], s[i + 1]] = [s[i + 1], s[i]];
    this.draftSteps = s;
  }

  saveSteps(): void {
    const invalid = this.draftSteps.some((s) => !s.phase_label.trim() || !s.assigned_user_id);
    if (invalid) { this.toast.error('All phases need a label and assigned staff.'); return; }

    this.saving.set(true);
    this.api.replaceSteps(this.editingId!, this.draftSteps as { phase_label: string; assigned_user_id: number }[]).subscribe({
      next: (updated) => {
        this.workflows.update((ws) => ws.map((w) => w.id === updated.id ? { ...updated, step_count: updated.steps.length } : w));
        this.editingId = null; this.draftSteps = [];
        this.saving.set(false);
        this.toast.success('Workflow phases saved.');
      },
      error: (err) => { this.saving.set(false); this.toast.error(err?.error?.error?.message ?? 'Failed.'); },
    });
  }

  removeWorkflow(w: Workflow): void {
    if (!confirm(`Delete workflow "${w.name}"? This cannot be undone.`)) return;
    this.api.remove(w.id).subscribe({
      next: () => { this.workflows.update((ws) => ws.filter((x) => x.id !== w.id)); this.toast.success('Workflow deleted.'); },
      error: (err) => this.toast.error(err?.error?.error?.message ?? 'Cannot delete.'),
    });
  }

  staffEmail(id: number | null): string {
    if (!id) return '—';
    return this.staffUsers().find((u) => u.id === id)?.email ?? String(id);
  }
}

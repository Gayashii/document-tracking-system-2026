import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';
import { SpinnerComponent } from '../../../shared/components/spinner/spinner';
import { PaginationComponent } from '../../../shared/components/pagination/pagination';
import { environment } from '../../../../environments/environment';

interface User {
  id: number;
  email: string;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

@Component({
  selector: 'app-user-management',
  imports: [FormsModule, SpinnerComponent, PaginationComponent],
  templateUrl: './user-management.html',
})
export class UserManagement implements OnInit {
  private readonly http  = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly auth  = inject(AuthService);
  private readonly base  = `${environment.apiBaseUrl}/users`;

  readonly activeAdminCount = signal(0);

  readonly loading    = signal(true);
  readonly saving     = signal(false);
  readonly users      = signal<User[]>([]);
  readonly page       = signal(1);
  readonly totalPages = signal(1);
  readonly total      = signal(0);

  // Filters
  search     = '';
  roleFilter = '';
  statusFilter = '';

  // Create user modal
  showCreateModal = false;
  createEmail     = '';
  createPassword  = '';
  createRole      = 'student';

  // Inline edit
  editingId: number | null = null;
  editRole      = '';
  editIsActive  = true;

  readonly roles = ['admin', 'finance_staff', 'student', 'auditor'];

  get currentUserId(): number | undefined { return this.auth.currentUser?.id; }

  canDeactivate(user: User): boolean {
    if (!user.is_active) return false;
    if (user.id === this.currentUserId) return false;
    if (user.role === 'admin' && this.activeAdminCount() <= 1) return false;
    return true;
  }

  private loadActiveAdminCount(): void {
    this.http.get<any>(this.base, { params: { role: 'admin', status: 'active', limit: '1' } }).subscribe({
      next: (res) => this.activeAdminCount.set(res.pagination.total),
      error: () => { /* non-critical */ },
    });
  }

  ngOnInit(): void { this.load(); this.loadActiveAdminCount(); }

  load(page = 1): void {
    this.loading.set(true);
    const params: any = { page, limit: 20 };
    if (this.search)       params.search = this.search;
    if (this.roleFilter)   params.role   = this.roleFilter;
    if (this.statusFilter) params.status = this.statusFilter;

    this.http.get<any>(this.base, { params }).subscribe({
      next: (res) => {
        this.users.set(res.data);
        this.page.set(res.pagination.page);
        this.totalPages.set(res.pagination.totalPages);
        this.total.set(res.pagination.total);
        this.loading.set(false);
      },
      error: () => { this.toast.error('Failed to load users.'); this.loading.set(false); },
    });
  }

  applyFilters(): void { this.load(1); }
  onPageChange(p: number): void { this.load(p); }

  openCreate(): void {
    this.createEmail = ''; this.createPassword = ''; this.createRole = 'student';
    this.showCreateModal = true;
  }

  submitCreate(): void {
    if (!this.createEmail || !this.createPassword) return;
    this.saving.set(true);
    this.http.post<any>(this.base, {
      email: this.createEmail, password: this.createPassword, role: this.createRole,
    }).subscribe({
      next: () => {
        this.toast.success('User created.');
        this.showCreateModal = false;
        this.saving.set(false);
        this.load(1);
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err?.error?.error?.message ?? 'Failed to create user.');
      },
    });
  }

  startEdit(user: User): void {
    this.editingId   = user.id;
    this.editRole    = user.role;
    this.editIsActive = user.is_active;
  }

  cancelEdit(): void { this.editingId = null; }

  saveEdit(user: User): void {
    this.saving.set(true);
    this.http.patch<any>(`${this.base}/${user.id}`, {
      role: this.editRole, is_active: this.editIsActive,
    }).subscribe({
      next: (res) => {
        this.users.update((us) => us.map((u) => u.id === user.id ? res.data : u));
        this.editingId = null;
        this.saving.set(false);
        this.toast.success('User updated.');
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err?.error?.error?.message ?? 'Failed to update user.');
      },
    });
  }

  deactivate(user: User): void {
    if (!confirm(`Deactivate ${user.email}? Their sessions will be revoked.`)) return;
    this.http.delete(`${this.base}/${user.id}`).subscribe({
      next: () => {
        this.users.update((us) => us.map((u) => u.id === user.id ? { ...u, is_active: false } : u));
        this.toast.success('User deactivated.');
        this.loadActiveAdminCount();
      },
      error: (err) => this.toast.error(err?.error?.error?.message ?? 'Failed to deactivate user.'),
    });
  }

  resetMfa(user: User): void {
    if (!confirm(`Force MFA re-enrolment for ${user.email}?`)) return;
    this.http.post(`${this.base}/${user.id}/mfa/reset`, {}).subscribe({
      next: () => this.toast.success('MFA reset. User must re-enrol on next login.'),
      error: (err) => this.toast.error(err?.error?.error?.message ?? 'Failed to reset MFA.'),
    });
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}

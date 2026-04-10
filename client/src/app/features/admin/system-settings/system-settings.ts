import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../core/services/toast.service';
import { SpinnerComponent } from '../../../shared/components/spinner/spinner';
import { environment } from '../../../../environments/environment';

interface SettingRow {
  key: string;
  value: string;
  updated_at: string | null;
  updated_by_email: string | null;
}

interface SettingMeta {
  label: string;
  description: string;
  type: 'text' | 'number' | 'boolean';
}

const SETTING_META: Record<string, SettingMeta> = {
  max_file_size_mb:            { label: 'Max File Size (MB)',             description: 'Maximum upload size per document file.',          type: 'number'  },
  allowed_mime_types:          { label: 'Allowed MIME Types',             description: 'Comma-separated list of accepted MIME types.',    type: 'text'    },
  session_timeout_minutes:     { label: 'Session Timeout (minutes)',      description: 'Idle timeout before a session is invalidated.',   type: 'number'  },
  overdue_threshold_days:      { label: 'Overdue Threshold (days)',       description: 'Days after submission before a doc is overdue.',  type: 'number'  },
  mfa_required_roles:          { label: 'MFA Required Roles',             description: 'Comma-separated roles that must complete MFA.',   type: 'text'    },
  email_notifications_enabled: { label: 'Email Notifications Enabled',   description: 'Master switch for outgoing email notifications.', type: 'boolean' },
};

@Component({
  selector: 'app-system-settings',
  imports: [FormsModule, SpinnerComponent],
  templateUrl: './system-settings.html',
})
export class SystemSettings implements OnInit {
  private readonly http  = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly base  = `${environment.apiBaseUrl}/settings`;

  readonly loading = signal(true);
  readonly saving  = signal(false);
  readonly rows    = signal<SettingRow[]>([]);

  // Local editable values mirror
  editValues: Record<string, string> = {};

  readonly meta = SETTING_META;
  readonly metaKeys = Object.keys(SETTING_META);

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.http.get<any>(this.base).subscribe({
      next: (r) => {
        this.rows.set(r.data);
        // Seed editValues from loaded data
        const map: Record<string, string> = {};
        for (const row of r.data as SettingRow[]) { map[row.key] = row.value; }
        this.editValues = map;
        this.loading.set(false);
      },
      error: () => { this.toast.error('Failed to load settings.'); this.loading.set(false); },
    });
  }

  getMeta(key: string): SettingMeta {
    return this.meta[key] ?? { label: key, description: '', type: 'text' };
  }

  getRow(key: string): SettingRow | undefined {
    return this.rows().find((r) => r.key === key);
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  saveAll(): void {
    this.saving.set(true);
    const updates: Record<string, string> = {};
    for (const key of this.metaKeys) {
      if (this.editValues[key] !== undefined) updates[key] = this.editValues[key];
    }
    this.http.patch<any>(this.base, { settings: updates }).subscribe({
      next: (r) => {
        this.rows.set(r.data);
        const map: Record<string, string> = {};
        for (const row of r.data as SettingRow[]) { map[row.key] = row.value; }
        this.editValues = map;
        this.saving.set(false);
        this.toast.success('Settings saved.');
      },
      error: (err) => { this.saving.set(false); this.toast.error(err?.error?.error?.message ?? 'Failed to save settings.'); },
    });
  }
}

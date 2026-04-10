import { Component, inject, signal, OnInit, output } from '@angular/core';
import { NotificationApiService, AppNotification } from '../../../../core/services/api/notification-api.service';
import { SpinnerComponent } from '../../spinner/spinner';

@Component({
  selector: 'app-notification-list',
  imports: [SpinnerComponent],
  templateUrl: './notification-list.html',
})
export class NotificationListComponent implements OnInit {
  private readonly api = inject(NotificationApiService);

  readonly loading = signal(true);
  readonly notifications = signal<AppNotification[]>([]);
  readonly markingAll = signal(false);

  readonly allRead = output<void>();
  readonly closed = output<void>();

  ngOnInit(): void {
    this.api.getMine().subscribe({
      next: ({ data }) => {
        this.notifications.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  get unreadCount(): number {
    return this.notifications().filter((n) => n.status === 'pending').length;
  }

  markRead(notif: AppNotification): void {
    if (notif.status !== 'pending') return;
    this.api.markRead(notif.id).subscribe(() => {
      this.notifications.update((list) =>
        list.map((n) => (n.id === notif.id ? { ...n, status: 'sent' as const } : n))
      );
    });
  }

  markAllRead(): void {
    this.markingAll.set(true);
    this.api.markAllRead().subscribe(() => {
      this.notifications.update((list) => list.map((n) => ({ ...n, status: 'sent' as const })));
      this.markingAll.set(false);
      this.allRead.emit();
    });
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  }
}

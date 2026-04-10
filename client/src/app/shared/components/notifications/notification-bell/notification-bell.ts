import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { interval, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { NotificationApiService } from '../../../../core/services/api/notification-api.service';
import { NotificationListComponent } from '../notification-list/notification-list';

@Component({
  selector: 'app-notification-bell',
  imports: [NotificationListComponent],
  templateUrl: './notification-bell.html',
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  private readonly api = inject(NotificationApiService);

  readonly unreadCount = signal(0);
  readonly dropdownOpen = signal(false);

  private pollSub?: Subscription;

  ngOnInit(): void {
    this.fetchCount();
    // Poll every 60 seconds
    this.pollSub = interval(60_000)
      .pipe(switchMap(() => this.api.getUnreadCount()))
      .subscribe((count) => this.unreadCount.set(count));
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
  }

  toggleDropdown(): void {
    this.dropdownOpen.update((v) => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  onAllRead(): void {
    this.unreadCount.set(0);
  }

  private fetchCount(): void {
    this.api.getUnreadCount().subscribe((count) => this.unreadCount.set(count));
  }
}

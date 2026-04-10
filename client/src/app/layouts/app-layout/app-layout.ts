import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { NotificationBellComponent } from '../../shared/components/notifications/notification-bell/notification-bell';

@Component({
  selector: 'app-app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NotificationBellComponent],
  templateUrl: './app-layout.html',
  styleUrl: './app-layout.scss',
})
export class AppLayout {
  readonly auth = inject(AuthService);
  readonly sidebarOpen = signal(true);

  get user() {
    return this.auth.currentUser;
  }

  get isAdmin() {
    return this.user?.role === 'admin';
  }

  get isFinanceStaff() {
    return this.user?.role === 'finance_staff';
  }

  get isStudent() {
    return this.user?.role === 'student';
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  logout(): void {
    this.auth.logout();
  }
}

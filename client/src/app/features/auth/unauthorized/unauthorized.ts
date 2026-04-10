import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-unauthorized',
  imports: [RouterLink],
  template: `
    <div class="d-flex align-items-center justify-content-center min-vh-100">
      <div class="text-center px-4">
        <h1 class="display-1 fw-bold text-danger">403</h1>
        <h4 class="fw-bold mb-2">Access Denied</h4>
        <p class="text-muted mb-4">You do not have permission to view this page.</p>
        <a routerLink="/app/dashboard" class="btn btn-primary">Go to Dashboard</a>
      </div>
    </div>
  `,
})
export class Unauthorized {}

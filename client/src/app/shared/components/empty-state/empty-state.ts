import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  template: `
    <div class="text-center py-5 px-3">
      @if (icon()) {
        <div class="mb-3 opacity-40" [innerHTML]="icon()"></div>
      }
      <p class="fw-semibold mb-1">{{ heading() }}</p>
      @if (subtext()) {
        <p class="text-muted small mb-0">{{ subtext() }}</p>
      }
      @if (actionLabel()) {
        <button type="button" class="btn btn-link btn-sm mt-2" (click)="action.emit()">
          {{ actionLabel() }}
        </button>
      }
    </div>
  `,
})
export class EmptyStateComponent {
  readonly heading     = input<string>('Nothing here yet.');
  readonly subtext     = input<string>('');
  readonly icon        = input<string>('');
  readonly actionLabel = input<string>('');
  readonly action      = output<void>();
}

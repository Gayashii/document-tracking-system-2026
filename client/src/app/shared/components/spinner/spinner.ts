import { Component, input } from '@angular/core';

@Component({
  selector: 'app-spinner',
  template: `
    <span
      class="spinner-border"
      [class.spinner-border-sm]="size() === 'sm'"
      role="status"
      aria-hidden="true"
    ></span>
  `,
})
export class SpinnerComponent {
  readonly size = input<'sm' | 'md'>('md');
}
